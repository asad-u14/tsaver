const KEEP_RE = /^(FAILED|ERROR|E\s)/;
const SUMMARY_RE = /^=+.*(failed|passed|error).*=+$/i;
const PASSED_DOT_RE = /^[.\s]*$/;
const PASSED_WORD_RE = /^PASSED\b/;
/** pytest profile: keeps failures/errors/assertion diffs/summary, collapses passing noise. */
export class PytestFilter {
    passedCount = 0;
    keptAnything = false;
    processLine(line, emit) {
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
    flush(emit) {
        if (this.passedCount > 0 && !this.keptAnything) {
            emit(`${this.passedCount} passed`);
        }
        else if (this.passedCount > 0) {
            emit(`(${this.passedCount} passing tests collapsed)`);
        }
    }
    onExit(_exitCode, _emit) {
        // Failures are already kept inline via KEEP_RE/SUMMARY_RE.
    }
}
