export type SymbolKind = "function" | "class" | "const";

export interface SymbolDef {
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
}

export interface ImportEntry {
  file: string;
  line: number;
  importsFrom: string;
  names: string[];
}

export interface ReferenceEntry {
  name: string;
  file: string;
  line: number;
}

export interface Graph {
  builtAt: string;
  root: string;
  filesScanned: number;
  symbols: SymbolDef[];
  imports: ImportEntry[];
  references: ReferenceEntry[];
}
