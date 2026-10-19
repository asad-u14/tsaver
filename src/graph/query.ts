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
    references,
    importedBy: importedBy.map(({ file, line, importsFrom }) => ({ file, line, importsFrom })),
  };
}
