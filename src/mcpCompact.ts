export interface CompactOptions {
  maxString?: number;
  maxArray?: number;
}

const DEFAULT_MAX_STRING = 500;
const DEFAULT_MAX_ARRAY = 20;
const ARRAY_EDGE_KEEP = 3;

function compactString(value: string, maxString: number): string {
  if (value.length <= maxString) return value;
  const kept = value.slice(0, maxString);
  return `${kept}...(${value.length - maxString} more chars)`;
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
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = compactJson(v, opts);
  }
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
