import { selectFilter } from "../filters/index.js";
import { run as runCommand } from "../runner.js";
import { printStats } from "../stats.js";
import { saveEntry } from "../history.js";
import { checkAndRecordRun } from "../recentRunTracking.js";

const LABEL_MAX_LENGTH = 80;

function toLabel(fullCommand: string): string {
  const lines = fullCommand.split("\n");
  const firstLine = lines[0];
  const truncated =
    firstLine.length > LABEL_MAX_LENGTH ? `${firstLine.slice(0, LABEL_MAX_LENGTH)}...` : firstLine;
  return lines.length > 1 ? `${truncated} ...(+${lines.length - 1} more lines)` : truncated;
}

export async function run(args: string[]): Promise<number> {
  let rest = args;
  let stats = false;
  let dedupe = false;
  for (;;) {
    if (rest[0] === "--stats") {
      stats = true;
      rest = rest.slice(1);
    } else if (rest[0] === "--dedupe") {
      dedupe = true;
      rest = rest.slice(1);
    } else {
      break;
    }
  }
  if (rest[0] === "--") {
    rest = rest.slice(1);
  }

  if (rest.length === 0) {
    process.stderr.write("Usage: tsaver run [--stats] [--dedupe] -- <command> [args...]\n");
    return 1;
  }

  const [command, ...commandArgs] = rest;
  const { filter: stdoutFilter, name: filterName } = selectFilter(command);
  const { filter: stderrFilter } = selectFilter(command);
  const fullCommand = [command, ...commandArgs].join(" ");

  const result = await runCommand(command, commandArgs, stdoutFilter, stderrFilter, { bufferOutput: dedupe });

  const UNCHANGED_NOTE = "(unchanged since last run of this command within the last 30 minutes)";
  let unchanged = false;
  if (dedupe) {
    unchanged = checkAndRecordRun(fullCommand, result.rawText);
    if (unchanged) {
      process.stdout.write(UNCHANGED_NOTE + "\n");
    } else {
      result.flushBufferedOutput?.();
    }
  }

  const displayedStats = unchanged
    ? { lines: 1, bytes: Buffer.byteLength(UNCHANGED_NOTE, "utf8") + 1, words: UNCHANGED_NOTE.split(/\s+/).length }
    : result.filtered;

  if (stats) {
    printStats(result.raw, displayedStats);
  }

  saveEntry({
    kind: "run",
    label: toLabel([command, ...commandArgs].join(" ")),
    exitCode: result.exitCode,
    filterName,
    source: process.env.TSAVER_HOOK_SOURCE ? "hook" : "manual",
    stats: {
      rawLines: result.raw.lines,
      filteredLines: displayedStats.lines,
      rawBytes: result.raw.bytes,
      filteredBytes: displayedStats.bytes,
      rawWords: result.raw.words,
      filteredWords: displayedStats.words,
    },
    rawText: result.rawText,
    filteredText: unchanged ? UNCHANGED_NOTE : result.filteredText,
  });

  return result.exitCode ?? 1;
}
