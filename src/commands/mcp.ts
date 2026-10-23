import { readFileSync } from "node:fs";
import { compactJson } from "../mcpCompact.js";
import { statsForText, printStats } from "../stats.js";
import { saveEntry } from "../history.js";

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export async function mcp(args: string[]): Promise<number> {
  let rest = args;
  let stats = false;
  let pretty = false;
  let maxString: number | undefined;
  let maxArray: number | undefined;

  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--stats") {
      stats = true;
    } else if (arg === "--pretty") {
      pretty = true;
    } else if (arg === "--max-string") {
      maxString = Number(rest[++i]);
    } else if (arg === "--max-array") {
      maxArray = Number(rest[++i]);
    } else {
      positional.push(arg);
    }
  }

  const file = positional[0];
  const rawText = file ? readFileSync(file, "utf8") : await readStdin();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    process.stderr.write(`tsaver mcp: input is not valid JSON: ${(err as Error).message}\n`);
    return 1;
  }

  const compacted = compactJson(parsed, { maxString, maxArray });
  const outputText = pretty ? JSON.stringify(compacted, null, 2) : JSON.stringify(compacted);
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
