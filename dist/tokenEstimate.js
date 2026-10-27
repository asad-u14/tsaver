// A zero-dependency token-count estimate, calibrated against a real BPE
// tokenizer (gpt-tokenizer) on representative samples during development —
// not pulled in as a runtime dependency, since a full tokenizer is 20-30MB
// unpacked and exact-token accuracy isn't the goal here, just a better proxy
// than a flat char-count/word-count for deciding how aggressively to
// truncate a string.
//
// The key gap this closes: prose costs ~5-6 chars/token, but base64/hex/UUID
// strings — common in real MCP payloads (image blobs, hashes, tokens) — cost
// as little as ~1.5 chars/token, roughly 3-4x more expensive per character.
// A flat character limit treats both the same; this doesn't.
const PROSE_CHARS_PER_TOKEN = 4.5;
const DENSE_NO_SPACE_CHARS_PER_TOKEN = 3.0;
const BASE64_LIKE_CHARS_PER_TOKEN = 1.6;
// base64/hex/UUID-shaped text: high ratio of alphanumeric-plus-base64-symbol
// characters and no whitespace. Plain English prose/code almost always has
// spaces; a long run of word-like tokens without spaces is characteristic
// of encoded binary data.
const DENSE_CHARSET_RE = /^[A-Za-z0-9+/=_-]+$/;
export function estimateTokens(text) {
    if (text.length === 0)
        return 0;
    const hasSpaces = /\s/.test(text);
    const charsPerToken = !hasSpaces && DENSE_CHARSET_RE.test(text)
        ? BASE64_LIKE_CHARS_PER_TOKEN
        : hasSpaces
            ? PROSE_CHARS_PER_TOKEN
            : DENSE_NO_SPACE_CHARS_PER_TOKEN;
    return Math.ceil(text.length / charsPerToken);
}
/** True if `text` looks like base64/hex/binary-ish data rather than prose or code — used to decide truncation aggressiveness. */
export function looksDenseEncoded(text) {
    return !/\s/.test(text) && DENSE_CHARSET_RE.test(text) && text.length > 0;
}
