import { resolve } from "node:path";
import chalk from "chalk";
import { buildGraph, writeGraph } from "../graph/build.js";
import { loadGraph, queryGraph } from "../graph/query.js";
function parseDirFlag(args) {
    const idx = args.indexOf("--dir");
    if (idx === -1)
        return { dir: process.cwd(), rest: args };
    const dir = args[idx + 1];
    const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
    return { dir: dir ? resolve(dir) : process.cwd(), rest };
}
async function graphBuild(args) {
    const { dir } = parseDirFlag(args);
    const start = Date.now();
    const graph = buildGraph(dir);
    const outPath = writeGraph(graph);
    const elapsedMs = Date.now() - start;
    process.stdout.write([
        `Scanned ${graph.filesScanned} files in ${dir}`,
        `  symbols: ${graph.symbols.length}`,
        `  imports: ${graph.imports.length}`,
        `  references: ${graph.references.length}`,
        `Wrote ${outPath} in ${elapsedMs}ms`,
        "",
        "Note: this is a regex-based heuristic index, not an AST — expect occasional false positives/negatives.",
    ].join("\n") + "\n");
    return 0;
}
async function graphQuery(args) {
    const { dir, rest } = parseDirFlag(args);
    const name = rest[0];
    if (!name) {
        process.stderr.write("Usage: tsaver graph query <symbol> [--dir <path>]\n");
        return 1;
    }
    const graph = loadGraph(dir);
    if (!graph) {
        process.stderr.write(`No graph index found in ${dir}/.tsaver/graph.json — run \`tsaver graph build\` first.\n`);
        return 1;
    }
    const result = queryGraph(graph, name);
    if (result.definitions.length === 0 && result.references.length === 0 && result.importedBy.length === 0) {
        process.stdout.write(`No matches for "${name}".\n`);
        return 0;
    }
    const out = [];
    if (result.definitions.length > 0) {
        out.push(chalk.bold("Definitions:"));
        for (const d of result.definitions)
            out.push(`  ${d.kind.padEnd(8)} ${d.file}:${d.line}  ${d.name}`);
        out.push("");
    }
    if (result.importedBy.length > 0) {
        out.push(chalk.bold("Imported by:"));
        for (const imp of result.importedBy)
            out.push(`  ${imp.file}:${imp.line}  from "${imp.importsFrom}"`);
        out.push("");
    }
    if (result.references.length > 0) {
        out.push(chalk.bold(`References (${result.references.length}):`));
        for (const r of result.references.slice(0, 50))
            out.push(`  ${r.file}:${r.line}  ${r.name}`);
        if (result.references.length > 50) {
            out.push(`  ...(${result.references.length - 50} more)`);
        }
    }
    process.stdout.write(out.join("\n") + "\n");
    return 0;
}
export async function graph(args) {
    const [subcommand, ...rest] = args;
    if (subcommand === "build")
        return graphBuild(rest);
    if (subcommand === "query")
        return graphQuery(rest);
    process.stderr.write("Usage: tsaver graph build|query [--dir <path>] ...\n");
    return 1;
}
