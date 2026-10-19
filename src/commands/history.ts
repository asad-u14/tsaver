import { clearHistory, listEntries } from "../history.js";

async function historyClear(args: string[]): Promise<number> {
  const entries = listEntries();

  if (entries.length === 0) {
    process.stdout.write("History is already empty — nothing to clear.\n");
    return 0;
  }

  if (!args.includes("--force")) {
    process.stderr.write(
      `This will permanently delete ${entries.length} history entr${entries.length === 1 ? "y" : "ies"} ` +
        `(~/.tsaver/history/). Re-run with --force to confirm:\n` +
        `  tsaver history clear --force\n`,
    );
    return 1;
  }

  const removed = clearHistory();
  process.stdout.write(`Cleared ${removed} history entr${removed === 1 ? "y" : "ies"}.\n`);
  return 0;
}

export async function history(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  if (subcommand === "clear") return historyClear(rest);

  process.stderr.write("Usage: tsaver history clear [--force]\n");
  return 1;
}
