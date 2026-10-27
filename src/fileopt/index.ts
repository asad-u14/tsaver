import { readFileSync } from "node:fs";
import { extname } from "node:path";

export type FileKind = "pdf" | "notebook" | "image" | "text";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export function detectKind(path: string): FileKind {
  const ext = extname(path).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".ipynb") return "notebook";
  if (IMAGE_EXTS.has(ext)) return "image";
  return "text";
}

export function readAsText(path: string): string {
  return readFileSync(path, "utf8");
}

const QUERY_CONTEXT_LINES = 2;

/**
 * Filters `text` to lines matching `query` (case-insensitive) plus
 * `QUERY_CONTEXT_LINES` lines of surrounding context on each side, merging
 * overlapping/adjacent matches into one block and marking the gaps between
 * blocks — so a large plain-text file can be queried for a term instead of
 * always returning the whole thing.
 */
export function filterTextByQuery(text: string, query: string): string {
  const lines = text.split("\n");
  const lowerQuery = query.toLowerCase();
  const matchedLines = new Set<number>();

  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes(lowerQuery)) matchedLines.add(idx);
  });

  if (matchedLines.size === 0) return `(no lines matching "${query}")`;

  const keep = new Set<number>();
  for (const idx of matchedLines) {
    for (let i = Math.max(0, idx - QUERY_CONTEXT_LINES); i <= Math.min(lines.length - 1, idx + QUERY_CONTEXT_LINES); i++) {
      keep.add(i);
    }
  }

  const sortedKeep = [...keep].sort((a, b) => a - b);
  const out: string[] = [];
  let previousIdx: number | null = null;

  for (const idx of sortedKeep) {
    if (previousIdx !== null && idx > previousIdx + 1) {
      out.push(`... (${idx - previousIdx - 1} lines omitted) ...`);
    }
    out.push(lines[idx]);
    previousIdx = idx;
  }

  return out.join("\n");
}
