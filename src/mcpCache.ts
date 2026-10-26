import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MCP_CACHE_DIR = join(homedir(), ".tsaver", "mcp-cache");

function hashInput(rawText: string, maxString: number | undefined, maxArray: number | undefined): string {
  return createHash("sha1")
    .update(rawText)
    .update(String(maxString ?? ""))
    .update(String(maxArray ?? ""))
    .digest("hex");
}

/**
 * Looks up a previously-compacted result for the exact same raw JSON text
 * and options. An agent polling the same MCP tool repeatedly (e.g. the same
 * search query) would otherwise pay the full compaction cost — and the
 * agent-facing bytes — again on every call for output that's byte-identical
 * to one already seen.
 */
export function readMcpCache(
  rawText: string,
  maxString: number | undefined,
  maxArray: number | undefined,
): string | null {
  try {
    return readFileSync(join(MCP_CACHE_DIR, `${hashInput(rawText, maxString, maxArray)}.json`), "utf8");
  } catch {
    return null;
  }
}

export function writeMcpCache(
  rawText: string,
  maxString: number | undefined,
  maxArray: number | undefined,
  outputText: string,
): void {
  mkdirSync(MCP_CACHE_DIR, { recursive: true });
  writeFileSync(join(MCP_CACHE_DIR, `${hashInput(rawText, maxString, maxArray)}.json`), outputText, "utf8");
}
