import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
