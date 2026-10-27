import { spawn } from "node:child_process";
import readline from "node:readline";
import type { Filter } from "./filters/types.js";
import { Stats } from "./stats.js";
import { stripAnsi } from "./ansi.js";

export interface RunResult {
  exitCode: number | null;
  raw: Stats;
  filtered: Stats;
  rawText: string;
  filteredText: string;
  /** Present only when `bufferOutput` was requested — call to print the buffered output after deciding it should be shown. */
  flushBufferedOutput?: () => void;
  /** True if filtered output hit MAX_FILTERED_LINES/MAX_FILTERED_BYTES and further lines were dropped before reaching the agent. */
  truncated?: boolean;
}

// A long-running or watch-mode command (one that never naturally produces a
// quiet, filterable tail) has no other limit on how much filtered output it
// can push at the agent — a filter's reduction ratio doesn't help if the
// absolute volume is still huge. These caps bound the live/filtered side
// only; the raw side keeps accumulating so `tsaver retrieve` can still
// recover everything that was actually produced.
const MAX_FILTERED_LINES = 2000;
const MAX_FILTERED_BYTES = 500_000;

interface TruncationState {
  truncated: boolean;
}

function pump(
  stream: NodeJS.ReadableStream,
  filter: Filter,
  rawStats: Stats,
  filteredStats: Stats,
  rawChunks: string[],
  filteredChunks: string[],
  write: (chunk: string) => void,
  truncation: TruncationState,
): Promise<void> {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const emit = (line: string) => {
    if (truncation.truncated) return;
    if (filteredStats.lines >= MAX_FILTERED_LINES || filteredStats.bytes >= MAX_FILTERED_BYTES) {
      truncation.truncated = true;
      const notice = "--- tsaver: filtered output exceeded the cap, rest dropped (use `tsaver retrieve` for the full original) ---";
      filteredStats.addLine(notice);
      filteredChunks.push(notice);
      write(notice + "\n");
      return;
    }
    filteredStats.addLine(line);
    filteredChunks.push(line);
    write(line + "\n");
  };
  return new Promise((resolve) => {
    rl.on("line", (line) => {
      rawStats.addLine(line);
      rawChunks.push(line);
      filter.processLine(stripAnsi(line), emit);
    });
    rl.on("close", () => {
      filter.flush(emit);
      resolve();
    });
  });
}

export async function run(
  command: string,
  args: string[],
  stdoutFilter: Filter,
  stderrFilter: Filter,
  options: { bufferOutput?: boolean } = {},
): Promise<RunResult> {
  const child = spawn(command, args, { stdio: ["inherit", "pipe", "pipe"] });

  const rawStats = new Stats();
  const filteredStats = new Stats();
  const rawChunks: string[] = [];
  const filteredChunks: string[] = [];

  // Normally each filtered line is written to the real stream as soon as
  // it's emitted, so output stays live. When bufferOutput is set (used by
  // `tsaver run --dedupe`, which needs the complete output before deciding
  // whether to print it at all), writes go to an in-memory buffer instead
  // and are flushed to the real stream by the caller after this returns.
  const stdoutBuffer: string[] = [];
  const stderrBuffer: string[] = [];
  const writeStdout = options.bufferOutput ? (c: string) => stdoutBuffer.push(c) : (c: string) => process.stdout.write(c);
  const writeStderr = options.bufferOutput ? (c: string) => stderrBuffer.push(c) : (c: string) => process.stderr.write(c);

  // Shared across both streams so the cap is on total filtered output, not
  // double the limit via two independently-capped streams.
  const truncation: TruncationState = { truncated: false };

  const stdoutDone = pump(child.stdout!, stdoutFilter, rawStats, filteredStats, rawChunks, filteredChunks, writeStdout, truncation);
  const stderrDone = pump(child.stderr!, stderrFilter, rawStats, filteredStats, rawChunks, filteredChunks, writeStderr, truncation);

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code));
  });

  await Promise.all([stdoutDone, stderrDone]);

  // stdout and stderr each get their own filter instance, and a failing
  // command's exit code is visible to both — so a filter whose onExit
  // reports a non-zero exit (e.g. NpmFilter, CargoFilter) can end up
  // emitting the exact same "--- X exited with code N ---" line twice, once
  // per stream. Track lines already emitted by onExit across both calls and
  // skip an identical repeat rather than printing it twice.
  const seenExitLines = new Set<string>();
  const emitFinal = (write: (c: string) => void) => (line: string) => {
    if (seenExitLines.has(line)) return;
    seenExitLines.add(line);
    filteredStats.addLine(line);
    filteredChunks.push(line);
    write(line + "\n");
  };
  stdoutFilter.onExit(exitCode, emitFinal(writeStdout));
  stderrFilter.onExit(exitCode, emitFinal(writeStderr));

  return {
    exitCode,
    raw: rawStats,
    filtered: filteredStats,
    rawText: rawChunks.join("\n"),
    filteredText: filteredChunks.join("\n"),
    flushBufferedOutput: options.bufferOutput
      ? () => {
          for (const c of stdoutBuffer) process.stdout.write(c);
          for (const c of stderrBuffer) process.stderr.write(c);
        }
      : undefined,
    truncated: truncation.truncated,
  };
}
