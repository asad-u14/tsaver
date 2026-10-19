import chalk from "chalk";

export class Stats {
  lines = 0;
  bytes = 0;
  words = 0;

  addLine(line: string): void {
    this.lines++;
    this.bytes += Buffer.byteLength(line, "utf8") + 1;
    const trimmed = line.trim();
    this.words += trimmed.length ? trimmed.split(/\s+/).length : 0;
  }
}

export function statsForText(text: string): Stats {
  const stats = new Stats();
  for (const line of text.split("\n")) stats.addLine(line);
  return stats;
}

export interface StatsLike {
  lines: number;
  bytes: number;
  words: number;
}

function reduction(rawValue: number, filteredValue: number): string {
  if (rawValue === 0) return "0.0%";
  const pct = (1 - filteredValue / rawValue) * 100;
  return `${pct.toFixed(1)}%`;
}

export function printStats(raw: StatsLike, filtered: StatsLike): void {
  const rows: Array<[string, number, number]> = [
    ["lines", raw.lines, filtered.lines],
    ["bytes", raw.bytes, filtered.bytes],
    ["words (approx. tokens)", raw.words, filtered.words],
  ];

  const out: string[] = ["", chalk.bold("tsaver stats")];
  for (const [label, before, after] of rows) {
    out.push(
      `  ${label.padEnd(23)} ${before} -> ${after}  (${reduction(before, after)} reduction)`,
    );
  }
  process.stderr.write(out.join("\n") + "\n");
}
