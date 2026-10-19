import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
export const CACHE_DIR = join(homedir(), ".tsaver", "cache");
function hashPath(absPath) {
    return createHash("sha1").update(absPath).digest("hex");
}
/**
 * Writes extracted/optimized text content for `absPath` to a stable cache
 * file, overwritten fresh on every call. No staleness tracking is needed —
 * the Claude Code Read hook regenerates this live on every Read call, so
 * it's always current at the moment Claude actually reads it.
 */
export function writeCache(absPath, content) {
    mkdirSync(CACHE_DIR, { recursive: true });
    const cachePath = join(CACHE_DIR, `${hashPath(absPath)}.md`);
    writeFileSync(cachePath, content, "utf8");
    return cachePath;
}
