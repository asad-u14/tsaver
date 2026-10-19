import { resolve } from "node:path";
import { statSync } from "node:fs";
import { detectKind, readAsText } from "../fileopt/index.js";
import { pdfToText } from "../fileopt/pdf.js";
import { notebookToMarkdown } from "../fileopt/notebook.js";
import { optimizeImage } from "../fileopt/image.js";
import { statsForText, printStats } from "../stats.js";
import { saveEntry } from "../history.js";

export async function read(args: string[]): Promise<number> {
  let rest = args;
  let stats = false;
  if (rest[0] === "--stats") {
    stats = true;
    rest = rest.slice(1);
  }

  const path = rest[0];
  if (!path) {
    process.stderr.write("Usage: tsaver read [--stats] <path>\n");
    return 1;
  }

  const absPath = resolve(path);
  const kind = detectKind(absPath);

  let outputText: string;
  let historyStats: ReturnType<typeof textStats>;

  switch (kind) {
    case "pdf": {
      const originalBytes = statSync(absPath).size;
      outputText = await pdfToText(absPath);
      process.stdout.write(outputText + "\n");
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
      process.stdout.write(outputText + "\n");
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
      process.stdout.write(outputText + "\n");
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
      process.stdout.write(outputText);
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
    rawPath: absPath,
    filteredText: outputText,
  });

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
