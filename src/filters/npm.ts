import type { Emit, Filter } from "./types.js";
import { RepeatCollapser } from "./repeat.js";

const DROP_RE = /^(npm notice|npm timing|⸨|⠁|⠂|⠄)/i;
const PROGRESS_RE = /\r/;

/** npm profile: keeps errors/warnings/install summary, drops notices/spinners/timing noise, collapses repeated lines. */
export class NpmFilter implements Filter {
  private collapser = new RepeatCollapser();

  processLine(line: string, emit: Emit): void {
    if (PROGRESS_RE.test(line) || DROP_RE.test(line)) return;
    // Keep-worthy lines (errors/warnings/install summary) still go through the
    // collapser rather than bypassing it — a single deprecation warning that
    // repeats 40 times is exactly the noise this filter exists to collapse.
    // The collapser already flushes immediately whenever the line changes, so
    // this doesn't delay or hide a one-off error/warning.
    this.collapser.push(line, emit);
  }

  flush(emit: Emit): void {
    this.collapser.flush(emit);
  }

  onExit(exitCode: number | null, emit: Emit): void {
    if (exitCode !== 0 && exitCode !== null) {
      emit(`--- npm exited with code ${exitCode} ---`);
    }
  }
}
