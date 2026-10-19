import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
const HISTORY_DIR = join(homedir(), ".tsaver", "history");
function ensureDir() {
    mkdirSync(HISTORY_DIR, { recursive: true });
}
function generateId() {
    return randomBytes(5).toString("hex");
}
export function saveEntry(entry) {
    ensureDir();
    const id = generateId();
    const full = { id, timestamp: new Date().toISOString(), ...entry };
    writeFileSync(join(HISTORY_DIR, `${id}.json`), JSON.stringify(full), "utf8");
    return id;
}
export function loadEntry(id) {
    try {
        return JSON.parse(readFileSync(join(HISTORY_DIR, `${id}.json`), "utf8"));
    }
    catch {
        return null;
    }
}
export function listEntries() {
    let files;
    try {
        files = readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
    }
    catch {
        return [];
    }
    const entries = [];
    for (const file of files) {
        try {
            entries.push(JSON.parse(readFileSync(join(HISTORY_DIR, file), "utf8")));
        }
        catch {
            // Skip unreadable/corrupt entries.
        }
    }
    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
/** Deletes all history entries. Returns the number of entries removed. */
export function clearHistory() {
    let files;
    try {
        files = readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
    }
    catch {
        return 0;
    }
    for (const file of files) {
        try {
            unlinkSync(join(HISTORY_DIR, file));
        }
        catch {
            // Best-effort — skip files that can't be removed (e.g. permissions).
        }
    }
    return files.length;
}
function reductionPct(rawBytes, filteredBytes) {
    return rawBytes === 0 ? 0 : (1 - filteredBytes / rawBytes) * 100;
}
export function summarizeHistory(entries) {
    let rawBytes = 0;
    let filteredBytes = 0;
    let rawWords = 0;
    let filteredWords = 0;
    const byKind = {};
    for (const entry of entries) {
        rawBytes += entry.stats.rawBytes;
        filteredBytes += entry.stats.filteredBytes;
        rawWords += entry.stats.rawWords;
        filteredWords += entry.stats.filteredWords;
        const g = byKind[entry.kind] ??
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
