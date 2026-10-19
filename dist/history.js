import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
function reductionPct(rawBytes, filteredBytes) {
    return rawBytes === 0 ? 0 : (1 - filteredBytes / rawBytes) * 100;
}
export function summarizeHistory(entries) {
    let rawBytes = 0;
    let filteredBytes = 0;
    const byKind = {};
    for (const entry of entries) {
        rawBytes += entry.stats.rawBytes;
        filteredBytes += entry.stats.filteredBytes;
        const g = byKind[entry.kind] ?? { count: 0, rawBytes: 0, filteredBytes: 0, reductionPct: 0 };
        g.count++;
        g.rawBytes += entry.stats.rawBytes;
        g.filteredBytes += entry.stats.filteredBytes;
        byKind[entry.kind] = g;
    }
    for (const kind of Object.keys(byKind)) {
        byKind[kind].reductionPct = reductionPct(byKind[kind].rawBytes, byKind[kind].filteredBytes);
    }
    return {
        totalEntries: entries.length,
        rawBytes,
        filteredBytes,
        reductionPct: reductionPct(rawBytes, filteredBytes),
        byKind,
    };
}
