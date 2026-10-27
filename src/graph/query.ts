import { readFileSync } from "node:fs";
import { graphOutputPath } from "./build.js";
import type { Graph, ImportEntry, ReferenceEntry, SymbolDef } from "./types.js";

export interface QueryResult {
  definitions: SymbolDef[];
  references: ReferenceEntry[];
  importedBy: Array<{ file: string; line: number; importsFrom: string }>;
}

export function loadGraph(rootDir: string): Graph | null {
  try {
    return JSON.parse(readFileSync(graphOutputPath(rootDir), "utf8"));
  } catch {
    return null;
  }
}

function matchesExact(name: string, query: string): boolean {
  return name === query;
}

function matchesSubstring(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.toLowerCase());
}

/**
 * Orders references so widely-used symbols outrank one-off matches, instead
 * of the original file-scan order. A substring query (e.g. "Filter") can
 * pull in several distinct symbol names at once — this ranks each name by
 * how many distinct files reference it (then by total reference count as a
 * tiebreaker), so a symbol referenced across many files sorts ahead of one
 * referenced only where it's used once, before any truncation happens.
 * Reference order within a single name is left untouched.
 */
function rankReferencesByUsage(references: ReferenceEntry[]): ReferenceEntry[] {
  const byName = new Map<string, ReferenceEntry[]>();
  for (const ref of references) {
    const group = byName.get(ref.name);
    if (group) group.push(ref);
    else byName.set(ref.name, [ref]);
  }

  const rankedNames = [...byName.keys()].sort((a, b) => {
    const groupA = byName.get(a)!;
    const groupB = byName.get(b)!;
    const fileCountA = new Set(groupA.map((r) => r.file)).size;
    const fileCountB = new Set(groupB.map((r) => r.file)).size;
    if (fileCountB !== fileCountA) return fileCountB - fileCountA;
    return groupB.length - groupA.length;
  });

  return rankedNames.flatMap((n) => byName.get(n)!);
}

export function queryGraph(graph: Graph, name: string): QueryResult {
  let definitions = graph.symbols.filter((s) => matchesExact(s.name, name));
  let references = graph.references.filter((r) => matchesExact(r.name, name));

  if (definitions.length === 0 && references.length === 0) {
    definitions = graph.symbols.filter((s) => matchesSubstring(s.name, name));
    references = graph.references.filter((r) => matchesSubstring(r.name, name));
  }

  const matchedNames = new Set([...definitions.map((d) => d.name), ...references.map((r) => r.name)]);
  const importedBy: ImportEntry[] = graph.imports.filter((imp) =>
    imp.names.some((n) => matchedNames.has(n)) || matchesSubstring(imp.importsFrom, name),
  );

  return {
    definitions,
    references: rankReferencesByUsage(references),
    importedBy: importedBy.map(({ file, line, importsFrom }) => ({ file, line, importsFrom })),
  };
}
