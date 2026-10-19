#!/usr/bin/env node
import { run } from "./commands/run.js";
import { read } from "./commands/read.js";
import { mcp } from "./commands/mcp.js";
import { filtersGaps } from "./commands/filtersGaps.js";
import { report } from "./commands/report.js";
import { retrieve } from "./commands/retrieve.js";
import { init } from "./commands/init.js";
import { graph } from "./commands/graph.js";
import { dashboard } from "./commands/dashboard.js";
function printUsage() {
    process.stderr.write([
        "Usage:",
        "  tsaver run [--stats] -- <command> [args...]",
        "  tsaver read [--stats] <path>",
        "  tsaver mcp [--stats] [--max-string N] [--max-array N] [file]",
        "  tsaver filters gaps [--top N]",
        "  tsaver report",
        "  tsaver retrieve <id>",
        "  tsaver init --claude",
        "  tsaver graph build|query [--dir <path>] ...",
        "  tsaver dashboard [--port 4173]",
        "",
    ].join("\n"));
}
async function main() {
    const argv = process.argv.slice(2);
    const subcommand = argv[0];
    const rest = argv.slice(1);
    let exitCode;
    switch (subcommand) {
        case "run":
            exitCode = await run(rest);
            break;
        case "read":
            exitCode = await read(rest);
            break;
        case "mcp":
            exitCode = await mcp(rest);
            break;
        case "filters":
            if (rest[0] === "gaps") {
                exitCode = await filtersGaps(rest.slice(1));
            }
            else {
                printUsage();
                exitCode = 1;
            }
            break;
        case "report":
            exitCode = await report(rest);
            break;
        case "retrieve":
            exitCode = await retrieve(rest);
            break;
        case "init":
            exitCode = await init(rest);
            break;
        case "graph":
            exitCode = await graph(rest);
            break;
        case "dashboard":
            exitCode = await dashboard(rest);
            break;
        default:
            printUsage();
            exitCode = subcommand ? 1 : 0;
    }
    process.exit(exitCode);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
