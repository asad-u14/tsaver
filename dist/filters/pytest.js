import { BlockRepeatCollapser } from "./blockRepeat.js";
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
/** pytest profile: keeps failures/errors/assertion diffs/summary, collapses passing/progress/banner noise, and collapses structurally-identical failure blocks. */
export class PytestFilter {
    passedCount = 0;
    keptAnything = false;
    // Tracks whether the immediately preceding input line was dropped, so a
    // blank line orphaned by that drop (banner's trailing blank, progress
    // block's trailing blank) can be dropped too — while a genuine blank line
    // that follows kept content (e.g. after a test-name header) still survives.
    previousLineDropped = false;
    // A real `____ test_name ____` header marks the start of one failure's
    // block — exact-match RepeatCollapser can't group these (test names,
    // line numbers, and assertion values all differ between failures), but
    // two failures raising the same exception type with the same traceback
    // shape are still worth collapsing. Everything emitted between one
    // header and the next belongs to that block.
    blocks = new BlockRepeatCollapser();
    drop() {
        this.previousLineDropped = true;
    }
    // Lines that don't belong to any failure block (section headers, the
    // short-summary FAILED lines, the final result line) — these flush
    // whatever block was open and are emitted directly, never fed into the
    // block collapser, so they can't corrupt a block's structural signature.
    keepOutsideBlock(line, emit) {
        this.keptAnything = true;
        this.previousLineDropped = false;
        this.blocks.exitBlockContext(emit);
        emit(stripDecoration(line));
    }
    // Lines that are part of the current failure's traceback body — fed into
    // the block collapser so structurally-identical failures can be grouped.
    keepInBlock(line, emit) {
        this.keptAnything = true;
        this.previousLineDropped = false;
        const stripped = stripDecoration(line);
        if (UNDERSCORE_HEADER_RE.test(line)) {
            this.blocks.startBlock(emit);
        }
        this.blocks.pushLine(stripped);
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
        // Any standalone "=== label ===" section header (not just the specific
        // failed/passed/error summary line SUMMARY_RE catches) marks a
        // transition between sections — e.g. "=== FAILURES ===" opens the
        // failures section, "=== short test summary info ===" closes it — so
        // it must exit block context too, the same as SUMMARY_RE lines.
        if (SUMMARY_RE.test(line) || EQUALS_HEADER_RE.test(line)) {
            this.keepOutsideBlock(line, emit);
            return;
        }
        // A one-line "FAILED path::test - detail" short-summary entry (no
        // leading whitespace, no underscore-header) is distinct from the `E `/
        // traceback lines that make up a failure's body — the latter belong
        // in the block, the former is its own standalone line.
        if (KEEP_RE.test(line)) {
            if (/^FAILED\b/.test(line)) {
                this.keepOutsideBlock(line, emit);
            }
            else {
                this.keepInBlock(line, emit);
            }
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
        this.keepInBlock(line, emit);
    }
    flush(emit) {
        this.blocks.flush(emit);
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
