import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TRACKING_PATH = join(homedir(), ".tsaver", "recent-runs.json");
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 50;

interface RecentRunEntry {
  outputHash: string;
  timestamp: string;
}

type RecentRunStore = Record<string, RecentRunEntry>;

function hashOutput(rawText: string): string {
  return createHash("sha1").update(rawText).digest("hex");
}

function readStore(): RecentRunStore {
  try {
    return JSON.parse(readFileSync(TRACKING_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(store: RecentRunStore): void {
  mkdirSync(join(homedir(), ".tsaver"), { recursive: true });
  // Cap the ring buffer by dropping the oldest entries once over MAX_ENTRIES
  // — this is a short-lived "did anything change recently" check, not a
  // permanent log (that's history.ts's job), so unbounded growth isn't
  // appropriate here.
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => store[a].timestamp.localeCompare(store[b].timestamp));
    for (const key of sorted.slice(0, keys.length - MAX_ENTRIES)) delete store[key];
  }
  writeFileSync(TRACKING_PATH, JSON.stringify(store), "utf8");
}

/**
 * Checks whether `rawText` (a command's full raw output) is byte-identical
 * to that same command's output from its last recorded run, within
 * `SESSION_TTL_MS`. Records the current run's hash either way, so repeated
 * identical runs within the window keep matching and a changed run resets
 * the baseline for next time.
 */
export function checkAndRecordRun(commandKey: string, rawText: string): boolean {
  const store = readStore();
  const existing = store[commandKey];
  const hash = hashOutput(rawText);

  let unchanged = false;
  if (existing && existing.outputHash === hash) {
    const age = Date.now() - new Date(existing.timestamp).getTime();
    unchanged = age <= SESSION_TTL_MS;
  }

  store[commandKey] = { outputHash: hash, timestamp: new Date().toISOString() };
  writeStore(store);

  return unchanged;
}
