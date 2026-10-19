import { extname } from "node:path";
import type { ImportEntry, ReferenceEntry, SymbolDef } from "./types.js";

const JS_TS_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const PY_EXTS = new Set([".py"]);

export type Language = "js-ts" | "python";

export function detectLanguage(path: string): Language | null {
  const ext = extname(path).toLowerCase();
  if (JS_TS_EXTS.has(ext)) return "js-ts";
  if (PY_EXTS.has(ext)) return "python";
  return null;
}

interface ExtractResult {
  symbols: SymbolDef[];
  imports: ImportEntry[];
}

const JS_TS_PATTERNS: Array<{ re: RegExp; kind: SymbolDef["kind"] }> = [
  { re: /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/, kind: "function" },
  { re: /\bclass\s+([A-Za-z_$][\w$]*)\b/, kind: "class" },
  { re: /\b(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/, kind: "const" },
  { re: /\b(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/, kind: "const" },
];

const JS_IMPORT_RE =
  /\bimport\s+(?:type\s+)?(?:\{([^}]*)\}|(\*\s+as\s+[\w$]+)|([\w$]+))\s+from\s+["']([^"']+)["']/;
const JS_REQUIRE_RE = /\brequire\(\s*["']([^"']+)["']\s*\)/;

function extractJsTs(relPath: string, lines: string[]): ExtractResult {
  const symbols: SymbolDef[] = [];
  const imports: ImportEntry[] = [];

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;

    for (const { re, kind } of JS_TS_PATTERNS) {
      const m = re.exec(line);
      if (m) {
        symbols.push({ name: m[1], kind, file: relPath, line: lineNo });
      }
    }

    const importMatch = JS_IMPORT_RE.exec(line);
    if (importMatch) {
      const [, named, starAs, defaultName, modulePath] = importMatch;
      const names: string[] = [];
      if (named) {
        for (const part of named.split(",")) {
          const name = part.trim().split(/\s+as\s+/).pop()?.trim();
          if (name) names.push(name);
        }
      }
      if (starAs) names.push(starAs.trim());
      if (defaultName) names.push(defaultName.trim());
      imports.push({ file: relPath, line: lineNo, importsFrom: modulePath, names });
    }

    const requireMatch = JS_REQUIRE_RE.exec(line);
    if (requireMatch) {
      imports.push({ file: relPath, line: lineNo, importsFrom: requireMatch[1], names: [] });
    }
  });

  return { symbols, imports };
}

const PY_DEF_RE = /^\s*def\s+([A-Za-z_]\w*)\s*\(/;
const PY_CLASS_RE = /^\s*class\s+([A-Za-z_]\w*)\b/;
const PY_IMPORT_RE = /^\s*import\s+([\w.]+)/;
const PY_FROM_IMPORT_RE = /^\s*from\s+([\w.]+)\s+import\s+(.+)/;

function extractPython(relPath: string, lines: string[]): ExtractResult {
  const symbols: SymbolDef[] = [];
  const imports: ImportEntry[] = [];

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;

    const defMatch = PY_DEF_RE.exec(line);
    if (defMatch) symbols.push({ name: defMatch[1], kind: "function", file: relPath, line: lineNo });

    const classMatch = PY_CLASS_RE.exec(line);
    if (classMatch) symbols.push({ name: classMatch[1], kind: "class", file: relPath, line: lineNo });

    const fromImportMatch = PY_FROM_IMPORT_RE.exec(line);
    if (fromImportMatch) {
      const names = fromImportMatch[2]
        .split(",")
        .map((n) => n.trim().split(/\s+as\s+/).pop()?.trim())
        .filter((n): n is string => !!n);
      imports.push({ file: relPath, line: lineNo, importsFrom: fromImportMatch[1], names });
      return;
    }

    const importMatch = PY_IMPORT_RE.exec(line);
    if (importMatch) {
      imports.push({ file: relPath, line: lineNo, importsFrom: importMatch[1], names: [] });
    }
  });

  return { symbols, imports };
}

export function extractFromFile(relPath: string, content: string): ExtractResult | null {
  const lang = detectLanguage(relPath);
  if (!lang) return null;
  const lines = content.split("\n");
  return lang === "js-ts" ? extractJsTs(relPath, lines) : extractPython(relPath, lines);
}

/**
 * Heuristic, non-scope-aware reference pass: for each known symbol name, find
 * whole-word occurrences on lines other than the symbol's own definition line.
 * Produces false positives for common names — documented as approximate.
 */
export function findReferences(
  relPath: string,
  content: string,
  symbolNames: ReadonlySet<string>,
  definitionLines: ReadonlySet<number>,
): ReferenceEntry[] {
  if (symbolNames.size === 0) return [];
  const names = [...symbolNames].sort((a, b) => b.length - a.length);
  const combined = new RegExp(`\\b(${names.map(escapeRegExp).join("|")})\\b`, "g");

  const references: ReferenceEntry[] = [];
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (definitionLines.has(lineNo)) return;
    let match: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((match = combined.exec(line)) !== null) {
      if (!seen.has(match[1])) {
        seen.add(match[1]);
        references.push({ name: match[1], file: relPath, line: lineNo });
      }
    }
  });

  return references;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
