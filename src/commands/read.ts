import { resolve } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { detectKind, filterTextByQuery, readAsText } from "../fileopt/index.js";
import { pdfToText, type PageRange } from "../fileopt/pdf.js";
import { notebookToMarkdown } from "../fileopt/notebook.js";
import { optimizeImage } from "../fileopt/image.js";
import { readCacheIfFresh, writeCache } from "../fileopt/cache.js";
import { statsForText, printStats } from "../stats.js";
import { saveEntry } from "../history.js";

function parsePageRange(spec: string): PageRange | null {
  const match = /^(\d+)-(\d+)$/.exec(spec.trim());
  if (!match) return null;
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (first < 1 || last < first) return null;
  return { first, last };
}

export async function read(args: string[]): Promise<number> {
  let rest = args;
  let stats = false;
  let cacheMode = false;
  let pages: PageRange | undefined;
  let query: string | undefined;
  for (;;) {
    if (rest[0] === "--stats") {
      stats = true;
      rest = rest.slice(1);
    } else if (rest[0] === "--cache") {
      cacheMode = true;
      rest = rest.slice(1);
    } else if (rest[0] === "--pages") {
      const parsed = rest[1] ? parsePageRange(rest[1]) : null;
      if (!parsed) {
        process.stderr.write(`tsaver read: --pages expects N-M (e.g. --pages 1-5), got "${rest[1] ?? ""}"\n`);
        return 1;
      }
      pages = parsed;
      rest = rest.slice(2);
    } else if (rest[0] === "--query") {
      query = rest[1];
      if (!query) {
        process.stderr.write("tsaver read: --query requires a search term\n");
        return 1;
      }
      rest = rest.slice(2);
    } else {
      break;
    }
  }

  const path = rest[0];
  if (!path) {
    process.stderr.write("Usage: tsaver read [--stats] [--cache] [--pages N-M] [--query <term>] <path>\n");
    return 1;
  }

  const absPath = resolve(path);
  const kind = detectKind(absPath);

  // Partial extraction (--pages/--query) always does a fresh extraction —
  // the cached copy is the full document, so a cache hit here would ignore
  // the request and return the wrong (complete) content.
  const usingPartialExtraction = pages !== undefined || query !== undefined;

  // Images are excluded: their "cache" redirect target is the resized image
  // file itself, a separate mechanism from the text cache checked here, and
  // optimizeImage is cheap enough relative to PDF/notebook parsing that the
  // added staleness bookkeeping isn't worth it for that case.
  if (cacheMode && kind !== "image" && !usingPartialExtraction) {
    const freshCachePath = readCacheIfFresh(absPath);
    if (freshCachePath) {
      const cachedText = readFileSync(freshCachePath, "utf8");
      const cachedStats = statsForText(cachedText);
      // Use the real source file's on-disk size for "raw", same as a cold
      // extraction would — a PDF's raw byte count is its binary size, not
      // the already-extracted text's size, even when the extraction itself
      // was skipped because the cache was still fresh.
      const originalBytes = statSync(absPath).size;
      if (stats) {
        printStats(
          { lines: cachedStats.lines, bytes: originalBytes, words: cachedStats.words },
          { lines: cachedStats.lines, bytes: cachedStats.bytes, words: cachedStats.words },
        );
      }
      saveEntry({
        kind: "read",
        label: path,
        stats: {
          rawLines: cachedStats.lines,
          filteredLines: cachedStats.lines,
          rawBytes: originalBytes,
          filteredBytes: cachedStats.bytes,
          rawWords: cachedStats.words,
          filteredWords: cachedStats.words,
        },
        source: process.env.TSAVER_HOOK_SOURCE ? "hook" : "manual",
        rawPath: absPath,
        filteredText: cachedText,
      });
      process.stdout.write(freshCachePath + "\n");
      return 0;
    }
  }

  let outputText: string;
  let historyStats: ReturnType<typeof textStats>;
  // For images, the "cache" redirect target is the resized image file itself
  // (not text) — Claude's Read tool needs actual image bytes for vision, so
  // replacing that with a text summary would silently break image reading.
  let cacheRedirectPath: string | null = null;

  switch (kind) {
    case "pdf": {
      const originalBytes = statSync(absPath).size;
      outputText = await pdfToText(absPath, pages);
      if (query) outputText = filterTextByQuery(outputText, query);
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
      outputText = notebookToMarkdown(absPath, query);
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
      outputText = query ? filterTextByQuery(originalText, query) : originalText;
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
    // A partial extraction must never overwrite the full-document cache —
    // doing so would make the next unqualified `--cache` call silently
    // return this request's narrower slice instead of the whole document.
    const redirectPath = cacheRedirectPath ?? (usingPartialExtraction ? null : writeCache(absPath, outputText));
    if (redirectPath) {
      process.stdout.write(redirectPath + "\n");
    } else {
      process.stdout.write(outputText + "\n");
    }
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
