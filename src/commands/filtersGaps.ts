import chalk from "chalk";
import { listEntries } from "../history.js";

function basename(command: string): string {
  return command.trim().split(/\s+/)[0]?.split("/").pop() ?? command;
}

export async function filtersGaps(args: string[]): Promise<number> {
  let topN = 10;
  const topIdx = args.indexOf("--top");
  if (topIdx !== -1 && args[topIdx + 1]) {
    topN = Number(args[topIdx + 1]);
  }

  const entries = listEntries().filter(
    (e) => e.kind === "run" && e.filterName === "generic",
  );

  if (entries.length === 0) {
    process.stdout.write("No commands currently fall back to the generic filter.\n");
    return 0;
  }

  const groups = new Map<string, { runs: number; rawBytes: number; filteredBytes: number }>();
  for (const entry of entries) {
    const command = basename(entry.label);
    const g = groups.get(command) ?? { runs: 0, rawBytes: 0, filteredBytes: 0 };
    g.runs++;
    g.rawBytes += entry.stats.rawBytes;
    g.filteredBytes += entry.stats.filteredBytes;
    groups.set(command, g);
  }

  const rows = [...groups.entries()]
    .map(([command, g]) => ({
      command,
      runs: g.runs,
      rawBytes: g.rawBytes,
      reductionPct: g.rawBytes === 0 ? 0 : (1 - g.filteredBytes / g.rawBytes) * 100,
    }))
    .sort((a, b) => b.rawBytes - a.rawBytes)
    .slice(0, topN);

  const out: string[] = ["", chalk.bold("Commands without a custom filter (generic fallback)")];
  for (const row of rows) {
    out.push(
      `  ${row.command.padEnd(20)} runs=${row.runs}  raw_bytes=${row.rawBytes}  avg_reduction=${row.reductionPct.toFixed(1)}%`,
    );
  }
  out.push("", "Add .tsaver/filters/<command>.toml to improve filtering for these.");
  process.stdout.write(out.join("\n") + "\n");

  return 0;
}
