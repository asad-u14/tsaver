import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

const HISTORY_DIR = join(homedir(), ".tsaver", "history");

export interface HistoryStats {
  rawLines: number;
  filteredLines: number;
  rawBytes: number;
  filteredBytes: number;
  rawWords: number;
  filteredWords: number;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  kind: "run" | "read" | "mcp";
  label: string;
  exitCode?: number | null;
  filterName?: string;
  /** "hook" for commands rerouted by the Claude Code PreToolUse hook (tsaver init --claude); omitted/"manual" otherwise. */
  source?: "hook" | "manual";
  stats: HistoryStats;
  rawText?: string;
  rawPath?: string;
  filteredText: string;
}

function ensureDir(): void {
  mkdirSync(HISTORY_DIR, { recursive: true });
}

function generateId(): string {
  return randomBytes(5).toString("hex");
}

export function saveEntry(entry: Omit<HistoryEntry, "id" | "timestamp">): string {
  ensureDir();
  const id = generateId();
  const full: HistoryEntry = { id, timestamp: new Date().toISOString(), ...entry };
  writeFileSync(join(HISTORY_DIR, `${id}.json`), JSON.stringify(full), "utf8");
  return id;
}

export function loadEntry(id: string): HistoryEntry | null {
  try {
    return JSON.parse(readFileSync(join(HISTORY_DIR, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export function listEntries(): HistoryEntry[] {
  let files: string[];
  try {
    files = readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const entries: HistoryEntry[] = [];
  for (const file of files) {
    try {
      entries.push(JSON.parse(readFileSync(join(HISTORY_DIR, file), "utf8")));
    } catch {
      // Skip unreadable/corrupt entries.
    }
  }
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Deletes all history entries. Returns the number of entries removed. */
export function clearHistory(): number {
  let files: string[];
  try {
    files = readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return 0;
  }
  for (const file of files) {
    try {
      unlinkSync(join(HISTORY_DIR, file));
    } catch {
      // Best-effort — skip files that can't be removed (e.g. permissions).
    }
  }
  return files.length;
}

export interface KindSummary {
  count: number;
  rawBytes: number;
  filteredBytes: number;
  reductionPct: number;
  rawWords: number;
  filteredWords: number;
  wordsSaved: number;
}

export interface HistorySummary {
  totalEntries: number;
  rawBytes: number;
  filteredBytes: number;
  reductionPct: number;
  rawWords: number;
  filteredWords: number;
  /** Approximate tokens saved (whitespace-split word count proxy, not an exact tokenizer count). */
  wordsSaved: number;
  byKind: Record<string, KindSummary>;
}

function reductionPct(rawBytes: number, filteredBytes: number): number {
  return rawBytes === 0 ? 0 : (1 - filteredBytes / rawBytes) * 100;
}

export function summarizeHistory(entries: HistoryEntry[]): HistorySummary {
  let rawBytes = 0;
  let filteredBytes = 0;
  let rawWords = 0;
  let filteredWords = 0;
  const byKind: Record<string, KindSummary> = {};

  for (const entry of entries) {
    rawBytes += entry.stats.rawBytes;
    filteredBytes += entry.stats.filteredBytes;
    rawWords += entry.stats.rawWords;
    filteredWords += entry.stats.filteredWords;

    const g =
      byKind[entry.kind] ??
      { count: 0, rawBytes: 0, filteredBytes: 0, reductionPct: 0, rawWords: 0, filteredWords: 0, wordsSaved: 0 };
    g.count++;
    g.rawBytes += entry.stats.rawBytes;
    g.filteredBytes += entry.stats.filteredBytes;
    g.rawWords += entry.stats.rawWords;
    g.filteredWords += entry.stats.filteredWords;
    byKind[entry.kind] = g;
  }

  for (const kind of Object.keys(byKind)) {
    byKind[kind].reductionPct = reductionPct(byKind[kind].rawBytes, byKind[kind].filteredBytes);
    byKind[kind].wordsSaved = byKind[kind].rawWords - byKind[kind].filteredWords;
  }

  return {
    totalEntries: entries.length,
    rawBytes,
    filteredBytes,
    reductionPct: reductionPct(rawBytes, filteredBytes),
    rawWords,
    filteredWords,
    wordsSaved: rawWords - filteredWords,
    byKind,
  };
}
