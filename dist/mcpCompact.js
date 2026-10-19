const DEFAULT_MAX_STRING = 500;
const DEFAULT_MAX_ARRAY = 20;
const ARRAY_EDGE_KEEP = 3;
function compactString(value, maxString) {
    if (value.length <= maxString)
        return value;
    const kept = value.slice(0, maxString);
    return `${kept}...(${value.length - maxString} more chars)`;
}
function compactArray(value, opts) {
    const compactedItems = value.map((item) => compactJson(item, opts));
    if (compactedItems.length <= opts.maxArray)
        return compactedItems;
    const head = compactedItems.slice(0, ARRAY_EDGE_KEEP);
    const tail = compactedItems.slice(-ARRAY_EDGE_KEEP);
    const dropped = compactedItems.length - head.length - tail.length;
    return [...head, `...(${dropped} more items)`, ...tail];
}
function compactObject(value, opts) {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
        out[key] = compactJson(v, opts);
    }
    return out;
}
export function compactJson(value, opts = {}) {
    const resolved = {
        maxString: opts.maxString ?? DEFAULT_MAX_STRING,
        maxArray: opts.maxArray ?? DEFAULT_MAX_ARRAY,
    };
    if (typeof value === "string")
        return compactString(value, resolved.maxString);
    if (Array.isArray(value))
        return compactArray(value, resolved);
    if (value !== null && typeof value === "object") {
        return compactObject(value, resolved);
    }
    return value;
}
