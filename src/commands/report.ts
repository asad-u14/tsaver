import chalk from "chalk";
import { listEntries, summarizeHistory } from "../history.js";

export async function report(_args: string[]): Promise<number> {
  const entries = listEntries();

  if (entries.length === 0) {
    process.stdout.write("No history yet — run `tsaver run`, `tsaver read`, or `tsaver mcp` first.\n");
    return 0;
  }

  const summary = summarizeHistory(entries);

  const out: string[] = ["", chalk.bold(`tsaver report (${summary.totalEntries} entries)`)];
  for (const [kind, g] of Object.entries(summary.byKind)) {
    out.push(`  ${kind.padEnd(8)} count=${g.count}  ${g.rawBytes} -> ${g.filteredBytes} bytes  (${g.reductionPct.toFixed(1)}% reduction)`);
  }
  out.push("", `  total: ${summary.rawBytes} -> ${summary.filteredBytes} bytes  (${summary.reductionPct.toFixed(1)}% reduction)`);
  out.push(`  approx. tokens saved: ${summary.wordsSaved.toLocaleString()} (${summary.rawWords.toLocaleString()} -> ${summary.filteredWords.toLocaleString()})`);

  const hookCount = entries.filter((e) => e.source === "hook").length;
  const manualEntries = entries.filter((e) => e.source !== "hook");

  out.push("", "Recent entries:");
  if (manualEntries.length === 0) {
    out.push("  (none — all entries so far came from the Claude Code hook)");
  } else {
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
