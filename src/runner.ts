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
}

function pump(
  stream: NodeJS.ReadableStream,
  filter: Filter,
  rawStats: Stats,
  filteredStats: Stats,
  rawChunks: string[],
  filteredChunks: string[],
  write: (chunk: string) => void,
): Promise<void> {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const emit = (line: string) => {
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
): Promise<RunResult> {
  const child = spawn(command, args, { stdio: ["inherit", "pipe", "pipe"] });

  const rawStats = new Stats();
  const filteredStats = new Stats();
  const rawChunks: string[] = [];
  const filteredChunks: string[] = [];

  const stdoutDone = pump(child.stdout!, stdoutFilter, rawStats, filteredStats, rawChunks, filteredChunks, (c) =>
    process.stdout.write(c),
  );
  const stderrDone = pump(child.stderr!, stderrFilter, rawStats, filteredStats, rawChunks, filteredChunks, (c) =>
    process.stderr.write(c),
  );

  const exitCode: number | null = await new Promise((resolve) => {
    child.on("close", (code) => resolve(code));
  });

  await Promise.all([stdoutDone, stderrDone]);

  const emitFinal = (write: (c: string) => void) => (line: string) => {
    filteredStats.addLine(line);
    filteredChunks.push(line);
    write(line + "\n");
  };
  stdoutFilter.onExit(exitCode, emitFinal((c) => process.stdout.write(c)));
  stderrFilter.onExit(exitCode, emitFinal((c) => process.stderr.write(c)));

  return {
    exitCode,
    raw: rawStats,
    filtered: filteredStats,
    rawText: rawChunks.join("\n"),
    filteredText: filteredChunks.join("\n"),
  };
}
