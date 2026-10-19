import chalk from "chalk";
import { listEntries } from "../history.js";
export async function report(_args) {
    const entries = listEntries();
    if (entries.length === 0) {
        process.stdout.write("No history yet — run `tsaver run`, `tsaver read`, or `tsaver mcp` first.\n");
        return 0;
    }
    let rawBytes = 0;
    let filteredBytes = 0;
    const byKind = new Map();
    for (const entry of entries) {
        rawBytes += entry.stats.rawBytes;
        filteredBytes += entry.stats.filteredBytes;
        const g = byKind.get(entry.kind) ?? { count: 0, rawBytes: 0, filteredBytes: 0 };
        g.count++;
        g.rawBytes += entry.stats.rawBytes;
        g.filteredBytes += entry.stats.filteredBytes;
        byKind.set(entry.kind, g);
    }
    const totalReduction = rawBytes === 0 ? 0 : (1 - filteredBytes / rawBytes) * 100;
    const out = ["", chalk.bold(`tsaver report (${entries.length} entries)`)];
    for (const [kind, g] of byKind) {
        const pct = g.rawBytes === 0 ? 0 : (1 - g.filteredBytes / g.rawBytes) * 100;
        out.push(`  ${kind.padEnd(8)} count=${g.count}  ${g.rawBytes} -> ${g.filteredBytes} bytes  (${pct.toFixed(1)}% reduction)`);
    }
    out.push("", `  total: ${rawBytes} -> ${filteredBytes} bytes  (${totalReduction.toFixed(1)}% reduction)`);
    const hookCount = entries.filter((e) => e.source === "hook").length;
    const manualEntries = entries.filter((e) => e.source !== "hook");
    out.push("", "Recent entries:");
    if (manualEntries.length === 0) {
        out.push("  (none — all entries so far came from the Claude Code hook)");
    }
    else {
        for (const entry of manualEntries.slice(-10)) {
            out.push(`  ${entry.id}  ${entry.timestamp}  ${entry.kind.padEnd(5)}  ${entry.label}`);
        }
    }
    if (hookCount > 0) {
        out.push("", `  (${hookCount} additional entries from the Claude Code hook omitted — still counted above)`);
    }
    process.stdout.write(out.join("\n") + "\n");
    return 0;
}
