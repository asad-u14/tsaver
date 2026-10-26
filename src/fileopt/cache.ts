import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CACHE_DIR = join(homedir(), ".tsaver", "cache");

function hashPath(absPath: string): string {
  return createHash("sha1").update(absPath).digest("hex");
}

function manifestPath(absPath: string): string {
  return join(CACHE_DIR, `${hashPath(absPath)}.meta.json`);
}

function cacheFilePath(absPath: string): string {
  return join(CACHE_DIR, `${hashPath(absPath)}.md`);
}

interface CacheManifest {
  mtimeMs: number;
  size: number;
}

/**
 * Returns the existing cache path for `absPath` if its source file hasn't
 * changed (mtime + size unchanged) since that cache was written, without
 * doing any extraction — so a repeated `tsaver read --cache` on the same
 * unmodified PDF/notebook/image skips re-parsing it entirely. Returns null
 * if there's no cache yet or the source has changed, meaning the caller
 * must re-extract and call `writeCache`.
 */
export function readCacheIfFresh(absPath: string): string | null {
  let stat;
  try {
    stat = statSync(absPath);
  } catch {
    return null;
  }

  let manifest: CacheManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath(absPath), "utf8"));
  } catch {
    return null;
  }

  if (manifest.mtimeMs !== stat.mtimeMs || manifest.size !== stat.size) return null;

  const cachePath = cacheFilePath(absPath);
  try {
    statSync(cachePath);
  } catch {
    return null;
  }

  return cachePath;
}

/**
 * Writes extracted/optimized text content for `absPath` to a stable cache
 * file, along with a manifest recording the source's mtime/size at the time
 * of writing — so a later call can check `readCacheIfFresh` and skip
 * re-extraction if the source hasn't changed since.
 */
export function writeCache(absPath: string, content: string): string {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = cacheFilePath(absPath);
  writeFileSync(cachePath, content, "utf8");
  try {
    const stat = statSync(absPath);
    writeFileSync(manifestPath(absPath), JSON.stringify({ mtimeMs: stat.mtimeMs, size: stat.size } as CacheManifest));
  } catch {
    // Source file became unreadable between extraction and this write — the
    // cache content itself is still valid, just without a freshness record,
    // so the next call will simply re-extract rather than trust a stale one.
  }
  return cachePath;
}
