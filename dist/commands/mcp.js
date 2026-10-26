import { readFileSync } from "node:fs";
import { compactJson } from "../mcpCompact.js";
import { statsForText, printStats } from "../stats.js";
import { saveEntry } from "../history.js";
import { readMcpCache, writeMcpCache } from "../mcpCache.js";
function readStdin() {
    return new Promise((resolve, reject) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => (data += chunk));
        process.stdin.on("end", () => resolve(data));
        process.stdin.on("error", reject);
    });
}
export async function mcp(args) {
    let rest = args;
    let stats = false;
    let pretty = false;
    let maxString;
    let maxArray;
    const positional = [];
    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i];
        if (arg === "--stats") {
            stats = true;
        }
        else if (arg === "--pretty") {
            pretty = true;
        }
        else if (arg === "--max-string") {
            maxString = Number(rest[++i]);
        }
        else if (arg === "--max-array") {
            maxArray = Number(rest[++i]);
        }
        else {
            positional.push(arg);
        }
    }
    const file = positional[0];
    const rawText = file ? readFileSync(file, "utf8") : await readStdin();
    // --pretty re-formats cached minified output on a hit rather than
    // re-running compactJson, so the cache key intentionally excludes it —
    // only maxString/maxArray change what compaction actually produces.
    const cachedMinified = readMcpCache(rawText, maxString, maxArray);
    let outputText;
    if (cachedMinified !== null) {
        let cachedValue;
        try {
            cachedValue = JSON.parse(cachedMinified);
        }
        catch {
            cachedValue = undefined;
        }
        outputText = pretty && cachedValue !== undefined ? JSON.stringify(cachedValue, null, 2) : cachedMinified;
    }
    else {
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        }
        catch (err) {
            process.stderr.write(`tsaver mcp: input is not valid JSON: ${err.message}\n`);
            return 1;
        }
        const compacted = compactJson(parsed, { maxString, maxArray });
        const minified = JSON.stringify(compacted);
        writeMcpCache(rawText, maxString, maxArray, minified);
        outputText = pretty ? JSON.stringify(compacted, null, 2) : minified;
    }
    process.stdout.write(outputText + "\n");
    if (stats) {
        printStats(statsForText(rawText), statsForText(outputText));
    }
    const raw = statsForText(rawText);
    const filtered = statsForText(outputText);
    saveEntry({
        kind: "mcp",
        label: file ?? "<stdin>",
        stats: {
            rawLines: raw.lines,
            filteredLines: filtered.lines,
            rawBytes: raw.bytes,
            filteredBytes: filtered.bytes,
            rawWords: raw.words,
            filteredWords: filtered.words,
        },
        rawText,
        filteredText: outputText,
    });
    return 0;
}
