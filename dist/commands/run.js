import { selectFilter } from "../filters/index.js";
import { run as runCommand } from "../runner.js";
import { printStats } from "../stats.js";
import { saveEntry } from "../history.js";
const LABEL_MAX_LENGTH = 80;
function toLabel(fullCommand) {
    const lines = fullCommand.split("\n");
    const firstLine = lines[0];
    const truncated = firstLine.length > LABEL_MAX_LENGTH ? `${firstLine.slice(0, LABEL_MAX_LENGTH)}...` : firstLine;
    return lines.length > 1 ? `${truncated} ...(+${lines.length - 1} more lines)` : truncated;
}
export async function run(args) {
    let rest = args;
    let stats = false;
    if (rest[0] === "--stats") {
        stats = true;
        rest = rest.slice(1);
    }
    if (rest[0] === "--") {
        rest = rest.slice(1);
    }
    if (rest.length === 0) {
        process.stderr.write("Usage: tsaver run [--stats] -- <command> [args...]\n");
        return 1;
    }
    const [command, ...commandArgs] = rest;
    const { filter: stdoutFilter, name: filterName } = selectFilter(command);
    const { filter: stderrFilter } = selectFilter(command);
    const result = await runCommand(command, commandArgs, stdoutFilter, stderrFilter);
    if (stats) {
        printStats(result.raw, result.filtered);
    }
    saveEntry({
        kind: "run",
        label: toLabel([command, ...commandArgs].join(" ")),
        exitCode: result.exitCode,
        filterName,
        source: process.env.TSAVER_HOOK_SOURCE ? "hook" : "manual",
        stats: {
            rawLines: result.raw.lines,
            filteredLines: result.filtered.lines,
            rawBytes: result.raw.bytes,
            filteredBytes: result.filtered.bytes,
            rawWords: result.raw.words,
            filteredWords: result.filtered.words,
        },
        rawText: result.rawText,
        filteredText: result.filteredText,
    });
    return result.exitCode ?? 1;
}
