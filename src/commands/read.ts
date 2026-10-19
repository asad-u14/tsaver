import { resolve } from "node:path";
import { statSync } from "node:fs";
import { detectKind, readAsText } from "../fileopt/index.js";
import { pdfToText } from "../fileopt/pdf.js";
import { notebookToMarkdown } from "../fileopt/notebook.js";
import { optimizeImage } from "../fileopt/image.js";
import { writeCache } from "../fileopt/cache.js";
import { statsForText, printStats } from "../stats.js";
import { saveEntry } from "../history.js";

export async function read(args: string[]): Promise<number> {
  let rest = args;
  let stats = false;
  let cacheMode = false;
  for (;;) {
    if (rest[0] === "--stats") {
      stats = true;
      rest = rest.slice(1);
    } else if (rest[0] === "--cache") {
      cacheMode = true;
      rest = rest.slice(1);
    } else {
      break;
    }
  }

  const path = rest[0];
  if (!path) {
    process.stderr.write("Usage: tsaver read [--stats] [--cache] <path>\n");
    return 1;
  }

  const absPath = resolve(path);
  const kind = detectKind(absPath);

  let outputText: string;
  let historyStats: ReturnType<typeof textStats>;
  // For images, the "cache" redirect target is the resized image file itself
  // (not text) — Claude's Read tool needs actual image bytes for vision, so
  // replacing that with a text summary would silently break image reading.
  let cacheRedirectPath: string | null = null;

  switch (kind) {
    case "pdf": {
      const originalBytes = statSync(absPath).size;
      outputText = await pdfToText(absPath);
      if (!cacheMode) process.stdout.write(outputText + "\n");
      const filtered = statsForText(outputText);
      historyStats = {
        rawLines: filtered.lines,
        filteredLines: filtered.lines,
        rawBytes: originalBytes,
        filteredBytes: filtered.bytes,
        rawWords: filtered.words,
        filteredWords: filtered.words,
      };
      break;
    }
    case "notebook": {
      const originalText = readAsText(absPath);
      outputText = notebookToMarkdown(absPath);
      if (!cacheMode) process.stdout.write(outputText + "\n");
      historyStats = textStats(originalText, outputText);
      break;
    }
    case "image": {
      const result = await optimizeImage(absPath);
      outputText = [
        `Optimized image written to ${result.outputPath}`,
        `  dimensions: ${result.originalWidth}x${result.originalHeight} -> ${result.newWidth}x${result.newHeight}`,
        `  bytes: ${result.originalBytes} -> ${result.optimizedBytes}`,
      ].join("\n");
      if (!cacheMode) process.stdout.write(outputText + "\n");
      cacheRedirectPath = result.outputPath;
      historyStats = {
        rawLines: 1,
        filteredLines: 1,
        rawBytes: result.originalBytes,
        filteredBytes: result.optimizedBytes,
        rawWords: 1,
        filteredWords: 1,
      };
      break;
    }
    default: {
      const originalText = readAsText(absPath);
      outputText = originalText;
      if (!cacheMode) process.stdout.write(outputText);
      historyStats = textStats(originalText, outputText);
    }
  }

  if (stats) {
    printStats(
      { lines: historyStats.rawLines, bytes: historyStats.rawBytes, words: historyStats.rawWords },
      { lines: historyStats.filteredLines, bytes: historyStats.filteredBytes, words: historyStats.filteredWords },
    );
  }

  saveEntry({
    kind: "read",
    label: path,
    stats: historyStats,
    source: process.env.TSAVER_HOOK_SOURCE ? "hook" : "manual",
    rawPath: absPath,
    filteredText: outputText,
  });

  if (cacheMode) {
    const redirectPath = cacheRedirectPath ?? writeCache(absPath, outputText);
    process.stdout.write(redirectPath + "\n");
  }

  return 0;
}

function textStats(rawText: string, filteredText: string) {
  const raw = statsForText(rawText);
  const filtered = statsForText(filteredText);
  return {
    rawLines: raw.lines,
    filteredLines: filtered.lines,
    rawBytes: raw.bytes,
    filteredBytes: filtered.bytes,
    rawWords: raw.words,
    filteredWords: filtered.words,
  };
}
