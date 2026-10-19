import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { detectLanguage, extractFromFile, findReferences } from "./extract.js";
import type { Graph } from "./types.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".tsaver", "coverage"]);

function walk(dir: string, root: string, files: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(".") && entry !== ".") continue;
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, root, files);
    } else if (st.isFile() && detectLanguage(full)) {
      files.push(full);
    }
  }
}

export function buildGraph(rootDir: string): Graph {
  const files: string[] = [];
  walk(rootDir, rootDir, files);

  const graph: Graph = {
    builtAt: new Date().toISOString(),
    root: rootDir,
    filesScanned: files.length,
    symbols: [],
    imports: [],
    references: [],
  };

  const perFile: Array<{ relPath: string; content: string; symbolNames: Set<string>; definitionLines: Set<number> }> = [];

  for (const absPath of files) {
    const relPath = relative(rootDir, absPath);
    let content: string;
    try {
      content = readFileSync(absPath, "utf8");
    } catch {
      continue;
    }
    const extracted = extractFromFile(relPath, content);
    if (!extracted) continue;

    graph.symbols.push(...extracted.symbols);
    graph.imports.push(...extracted.imports);

    const symbolNames = new Set(extracted.symbols.map((s) => s.name));
    const definitionLines = new Set(extracted.symbols.map((s) => s.line));
    perFile.push({ relPath, content, symbolNames, definitionLines });
  }

  const allSymbolNames = new Set(graph.symbols.map((s) => s.name));

  for (const { relPath, content, definitionLines } of perFile) {
    graph.references.push(...findReferences(relPath, content, allSymbolNames, definitionLines));
  }

  return graph;
}

export function graphOutputPath(rootDir: string): string {
  return join(rootDir, ".tsaver", "graph.json");
}

export function writeGraph(graph: Graph): string {
  const outPath = graphOutputPath(graph.root);
  mkdirSync(join(graph.root, ".tsaver"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(graph), "utf8");
  return outPath;
}
