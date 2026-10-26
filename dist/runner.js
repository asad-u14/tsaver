import { spawn } from "node:child_process";
import readline from "node:readline";
import { Stats } from "./stats.js";
import { stripAnsi } from "./ansi.js";
function pump(stream, filter, rawStats, filteredStats, rawChunks, filteredChunks, write) {
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const emit = (line) => {
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
export async function run(command, args, stdoutFilter, stderrFilter, options = {}) {
    const child = spawn(command, args, { stdio: ["inherit", "pipe", "pipe"] });
    const rawStats = new Stats();
    const filteredStats = new Stats();
    const rawChunks = [];
    const filteredChunks = [];
    // Normally each filtered line is written to the real stream as soon as
    // it's emitted, so output stays live. When bufferOutput is set (used by
    // `tsaver run --dedupe`, which needs the complete output before deciding
    // whether to print it at all), writes go to an in-memory buffer instead
    // and are flushed to the real stream by the caller after this returns.
    const stdoutBuffer = [];
    const stderrBuffer = [];
    const writeStdout = options.bufferOutput ? (c) => stdoutBuffer.push(c) : (c) => process.stdout.write(c);
    const writeStderr = options.bufferOutput ? (c) => stderrBuffer.push(c) : (c) => process.stderr.write(c);
    const stdoutDone = pump(child.stdout, stdoutFilter, rawStats, filteredStats, rawChunks, filteredChunks, writeStdout);
    const stderrDone = pump(child.stderr, stderrFilter, rawStats, filteredStats, rawChunks, filteredChunks, writeStderr);
    const exitCode = await new Promise((resolve) => {
        child.on("close", (code) => resolve(code));
    });
    await Promise.all([stdoutDone, stderrDone]);
    // stdout and stderr each get their own filter instance, and a failing
    // command's exit code is visible to both — so a filter whose onExit
    // reports a non-zero exit (e.g. NpmFilter, CargoFilter) can end up
    // emitting the exact same "--- X exited with code N ---" line twice, once
    // per stream. Track lines already emitted by onExit across both calls and
    // skip an identical repeat rather than printing it twice.
    const seenExitLines = new Set();
    const emitFinal = (write) => (line) => {
        if (seenExitLines.has(line))
            return;
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
                for (const c of stdoutBuffer)
                    process.stdout.write(c);
                for (const c of stderrBuffer)
                    process.stderr.write(c);
            }
            : undefined,
    };
}
