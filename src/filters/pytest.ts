import type { Emit, Filter } from "./types.js";

const KEEP_RE = /^(FAILED|ERROR|E\s)/;
const SUMMARY_RE = /^=+.*(failed|passed|error).*=+$/i;
const PASSED_DOT_RE = /^[.\s]*$/;
const PASSED_WORD_RE = /^PASSED\b/;

/** pytest profile: keeps failures/errors/assertion diffs/summary, collapses passing noise. */
export class PytestFilter implements Filter {
  private passedCount = 0;
  private keptAnything = false;

  processLine(line: string, emit: Emit): void {
    if (KEEP_RE.test(line) || SUMMARY_RE.test(line)) {
      this.keptAnything = true;
      emit(line);
      return;
    }

    if (PASSED_WORD_RE.test(line)) {
      this.passedCount++;
      return;
    }

    if (PASSED_DOT_RE.test(line) && line.includes(".")) {
      this.passedCount += line.split("").filter((c) => c === ".").length;
      return;
    }

    this.keptAnything = true;
    emit(line);
  }

  flush(emit: Emit): void {
    if (this.passedCount > 0 && !this.keptAnything) {
      emit(`${this.passedCount} passed`);
    } else if (this.passedCount > 0) {
      emit(`(${this.passedCount} passing tests collapsed)`);
    }
  }

  onExit(_exitCode: number | null, _emit: Emit): void {
    // Failures are already kept inline via KEEP_RE/SUMMARY_RE.
  }
}
