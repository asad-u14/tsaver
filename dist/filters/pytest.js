const KEEP_RE = /^(FAILED|ERROR|E\s)/;
const SUMMARY_RE = /^=+.*(failed|passed|error).*=+$/i;
const PASSED_WORD_RE = /^\S+::\S+\s+PASSED\b/;
// Real pytest default-mode progress line: a file path, then a run of status
// characters (. passed, F failed, E error, s skipped, x xfail), optionally
// followed by a "[ NN%]" marker — e.g.
//   tests/test_auth.py ..............................                 [ 14%]
// A bare-dots-only line (older/plain output with no file prefix) is also
// matched as a degenerate case of the same pattern.
const PROGRESS_LINE_RE = /^(?:\S+\s+)?[.FEsx]+\s*(?:\[\s*\d{1,3}%\])?\s*$/;
// Startup banner pytest always prints before any test runs — none of it is
// test-specific signal, so it's dropped entirely rather than kept.
const BANNER_RE = /^(=+\s*test session starts\s*=+|platform \S+ -- Python|rootdir:|configfile:|plugins:|collected \d+ items?)/;
// Decorative section headers — "=== FAILURES ===" or "____ test_name ____" — are
// kept (they mark real structure), but the padding around a short label is
// noise, so only the label itself survives.
const EQUALS_HEADER_RE = /^=+\s*(.+?)\s*=+$/;
const UNDERSCORE_HEADER_RE = /^_+\s*(.+?)\s*_+$/;
function stripDecoration(line) {
    const eq = EQUALS_HEADER_RE.exec(line);
    if (eq)
        return eq[1];
    const us = UNDERSCORE_HEADER_RE.exec(line);
    if (us)
        return us[1];
    return line;
}
function countChar(line, char) {
    return line.split("").filter((c) => c === char).length;
}
/** pytest profile: keeps failures/errors/assertion diffs/summary, collapses passing/progress/banner noise. */
export class PytestFilter {
    passedCount = 0;
    keptAnything = false;
    // Tracks whether the immediately preceding input line was dropped, so a
    // blank line orphaned by that drop (banner's trailing blank, progress
    // block's trailing blank) can be dropped too — while a genuine blank line
    // that follows kept content (e.g. after a test-name header) still survives.
    previousLineDropped = false;
    drop() {
        this.previousLineDropped = true;
    }
    keep(line, emit) {
        this.keptAnything = true;
        this.previousLineDropped = false;
        emit(stripDecoration(line));
    }
    processLine(line, emit) {
        if (BANNER_RE.test(line)) {
            this.drop();
            return;
        }
        if (line.trim() === "" && this.previousLineDropped) {
            this.drop();
            return;
        }
        if (SUMMARY_RE.test(line) || KEEP_RE.test(line)) {
            this.keep(line, emit);
            return;
        }
        if (PASSED_WORD_RE.test(line)) {
            this.passedCount++;
            this.drop();
            return;
        }
        if (PROGRESS_LINE_RE.test(line) && /[.FEsx]/.test(line)) {
            this.passedCount += countChar(line, ".");
            this.drop();
            return;
        }
        this.keep(line, emit);
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
