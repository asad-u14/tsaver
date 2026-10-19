import type { Emit } from "./types.js";

function normalize(line: string): string {
  return line.replace(/\d+/g, "#").trim();
}

/** Collapses runs of REPEAT_THRESHOLD+ consecutive normalized-identical lines into `<line> (×N)`. */
export class RepeatCollapser {
  private normalized: string | null = null;
  private lines: string[] = [];
  private readonly threshold: number;

  constructor(threshold = 3) {
    this.threshold = threshold;
  }

  push(line: string, emit: Emit): void {
    const normalized = normalize(line);
    if (this.normalized === normalized) {
      this.lines.push(line);
      return;
    }
    this.flush(emit);
    this.normalized = normalized;
    this.lines = [line];
  }

  flush(emit: Emit): void {
    if (this.lines.length === 0) return;
    if (this.lines.length >= this.threshold) {
      emit(`${this.lines[0]} (×${this.lines.length})`);
    } else {
      for (const line of this.lines) emit(line);
    }
    this.lines = [];
    this.normalized = null;
  }
}
