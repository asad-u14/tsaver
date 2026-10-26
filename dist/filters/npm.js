import { RepeatCollapser } from "./repeat.js";
const DROP_RE = /^(npm notice|npm timing|⸨|⠁|⠂|⠄)/i;
const PROGRESS_RE = /\r/;
/** npm profile: keeps errors/warnings/install summary, drops notices/spinners/timing noise, collapses repeated lines. */
export class NpmFilter {
    collapser = new RepeatCollapser();
    sawAnyLine = false;
    processLine(line, emit) {
        this.sawAnyLine = true;
        if (PROGRESS_RE.test(line) || DROP_RE.test(line))
            return;
        // Keep-worthy lines (errors/warnings/install summary) still go through the
        // collapser rather than bypassing it — a single deprecation warning that
        // repeats 40 times is exactly the noise this filter exists to collapse.
        // The collapser already flushes immediately whenever the line changes, so
        // this doesn't delay or hide a one-off error/warning.
        this.collapser.push(line, emit);
    }
    flush(emit) {
        this.collapser.flush(emit);
    }
    onExit(exitCode, emit) {
        if (exitCode !== 0 && exitCode !== null && this.sawAnyLine) {
            emit(`--- npm exited with code ${exitCode} ---`);
        }
    }
}
