import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const TRACKING_PATH = join(homedir(), ".tsaver", "retrieval-counts.json");
const DISABLE_THRESHOLD = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
function readStore() {
    try {
        return JSON.parse(readFileSync(TRACKING_PATH, "utf8"));
    }
    catch {
        return {};
    }
}
function writeStore(store) {
    mkdirSync(join(homedir(), ".tsaver"), { recursive: true });
    writeFileSync(TRACKING_PATH, JSON.stringify(store), "utf8");
}
/**
 * Called when a history entry's full original is retrieved via
 * `tsaver retrieve <id>`. If the agent keeps retrieving a given filter's
 * output in full, that filter's compaction is net-negative — it cost an
 * extra round-trip to undo — so this tracks how often each filter gets
 * retrieved, independent of how many times it successfully ran unretrieved.
 */
export function recordRetrieval(filterName) {
    if (!filterName)
        return;
    const store = readStore();
    const existing = store[filterName];
    const count = (existing?.count ?? 0) + 1;
    store[filterName] = { count, lastRetrievedAt: new Date().toISOString() };
    writeStore(store);
}
/**
 * True once a filter has been retrieved in full `DISABLE_THRESHOLD`+ times
 * within the last `COOLDOWN_MS` — i.e. it should be bypassed (unfiltered
 * passthrough) until the retrieval pattern stops. A cooldown lets the filter
 * re-enable itself automatically rather than staying disabled forever after
 * one noisy stretch of retrievals.
 */
export function isFilterDisabled(filterName) {
    const store = readStore();
    const state = store[filterName];
    if (!state)
        return false;
    if (state.count < DISABLE_THRESHOLD)
        return false;
    const age = Date.now() - new Date(state.lastRetrievedAt).getTime();
    if (age > COOLDOWN_MS) {
        delete store[filterName];
        writeStore(store);
        return false;
    }
    return true;
}
export { TRACKING_PATH };
