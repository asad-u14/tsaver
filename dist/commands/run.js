import { selectFilter } from "../filters/index.js";
import { run as runCommand } from "../runner.js";
import { printStats } from "../stats.js";
import { saveEntry } from "../history.js";
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
        label: [command, ...commandArgs].join(" "),
        exitCode: result.exitCode,
        filterName,
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
