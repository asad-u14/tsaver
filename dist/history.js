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
