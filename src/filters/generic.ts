import type { Emit, Filter } from "./types.js";

const ERROR_RE = /\b(error|fail(?:ed|ure)?|exception|traceback)\b/i;
const PROGRESS_RE = /\r|\[=*>?\s*\]\s*\d{1,3}%|^\s*\d{1,3}%\s*\|/;
const FIRST_KEEP = 5;
const LAST_WINDOW = 20;
const REPEAT_THRESHOLD = 3;

function normalize(line: string): string {
  return line.replace(/\d+/g, "#").trim();
}

interface WindowEntry {
  index: number;
  line: string;
}

interface PendingGroup {
  normalized: string;
  lines: Array<{ index: number; line: string }>;
}

/** Fallback filter: collapses repeated lines, drops progress spam, always keeps errors and head/tail. */
export class GenericFilter implements Filter {
  private index = 0;
  private pending: PendingGroup | null = null;
  private recentWindow: WindowEntry[] = [];
  private emittedIndices = new Set<number>();

  processLine(line: string, emit: Emit): void {
    this.index++;
    const currentIndex = this.index;

    this.recentWindow.push({ index: currentIndex, line });
    if (this.recentWindow.length > LAST_WINDOW) this.recentWindow.shift();

    if (currentIndex <= FIRST_KEEP) {
      this.flushPending(emit);
      this.emitTracked(currentIndex, line, emit);
      return;
    }

    if (PROGRESS_RE.test(line)) {
      return;
    }

    if (ERROR_RE.test(line)) {
      this.flushPending(emit);
      this.emitTracked(currentIndex, line, emit);
      return;
    }

    const normalized = normalize(line);
    if (this.pending && this.pending.normalized === normalized) {
      this.pending.lines.push({ index: currentIndex, line });
      return;
    }

    this.flushPending(emit);
    this.pending = { normalized, lines: [{ index: currentIndex, line }] };
  }

  private emitTracked(index: number, line: string, emit: Emit): void {
    this.emittedIndices.add(index);
    emit(line);
  }

  private flushPending(emit: Emit): void {
    if (!this.pending) return;
    const { lines } = this.pending;
    if (lines.length >= REPEAT_THRESHOLD) {
      this.emittedIndices.add(lines[0].index);
      emit(`${lines[0].line} (×${lines.length})`);
    } else {
      for (const { index, line } of lines) this.emitTracked(index, line, emit);
    }
    this.pending = null;
  }

  flush(emit: Emit): void {
    this.flushPending(emit);
  }

  onExit(exitCode: number | null, emit: Emit): void {
    if (exitCode === 0 || exitCode === null) return;
    const missing = this.recentWindow.filter((e) => !this.emittedIndices.has(e.index));
    if (missing.length === 0) return;
    emit("--- last lines before exit (non-zero exit code) ---");
    for (const entry of missing) emit(entry.line);
  }
}
