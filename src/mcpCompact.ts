import { looksDenseEncoded } from "./tokenEstimate.js";

export interface CompactOptions {
  maxString?: number;
  maxArray?: number;
}

const DEFAULT_MAX_STRING = 500;
const DEFAULT_MAX_ARRAY = 20;
const ARRAY_EDGE_KEEP = 3;

// base64/hex/binary-ish strings (image blobs, hashes, tokens — all common in
// real MCP payloads) cost roughly 3x more tokens per character than prose,
// so the same maxString allowance that's reasonable for English text is far
// too generous for this content type. This caps dense-encoded strings much
// harder regardless of maxString, since a user raising maxString for their
// prose-heavy payload shouldn't also mean "let a 50KB base64 blob through."
const DENSE_ENCODED_MAX_CHARS = 120;

function compactString(value: string, maxString: number): string {
  const effectiveMax = looksDenseEncoded(value) ? Math.min(maxString, DENSE_ENCODED_MAX_CHARS) : maxString;
  if (value.length <= effectiveMax) return value;
  const kept = value.slice(0, effectiveMax);
  return `${kept}...(${value.length - effectiveMax} more chars)`;
}

function compactArray(value: unknown[], opts: Required<CompactOptions>): unknown[] {
  const compactedItems = value.map((item) => compactJson(item, opts));
  if (compactedItems.length <= opts.maxArray) return compactedItems;

  const head = compactedItems.slice(0, ARRAY_EDGE_KEEP);
  const tail = compactedItems.slice(-ARRAY_EDGE_KEEP);
  const dropped = compactedItems.length - head.length - tail.length;
  return [...head, `...(${dropped} more items)`, ...tail];
}

function compactObject(
  value: Record<string, unknown>,
  opts: Required<CompactOptions>,
): Record<string, unknown> {
  const compactedEntries = Object.entries(value).map(
    ([key, v]) => [key, compactJson(v, opts)] as [string, unknown],
  );
  if (compactedEntries.length <= opts.maxArray) return Object.fromEntries(compactedEntries);

  const head = compactedEntries.slice(0, ARRAY_EDGE_KEEP);
  const tail = compactedEntries.slice(-ARRAY_EDGE_KEEP);
  const dropped = compactedEntries.length - head.length - tail.length;

  const out: Record<string, unknown> = {};
  for (const [key, v] of head) out[key] = v;
  out[`...(${dropped} more keys)`] = null;
  for (const [key, v] of tail) out[key] = v;
  return out;
}

export function compactJson(value: unknown, opts: CompactOptions = {}): unknown {
  const resolved: Required<CompactOptions> = {
    maxString: opts.maxString ?? DEFAULT_MAX_STRING,
    maxArray: opts.maxArray ?? DEFAULT_MAX_ARRAY,
  };

  if (typeof value === "string") return compactString(value, resolved.maxString);
  if (Array.isArray(value)) return compactArray(value, resolved);
  if (value !== null && typeof value === "object") {
    return compactObject(value as Record<string, unknown>, resolved);
  }
  return value;
}
