// "=== RUN   TestName" — printed before every test in -v mode, pure
// progress marker with no result info (the matching --- PASS/FAIL line
// carries the actual signal).
const RUN_RE = /^=== RUN\s+\S+/;
// "--- PASS: TestName (0.00s)" vs "--- FAIL: TestName (0.00s)". Test names
// almost always differ line to line, so exact-match repeat-collapsing
// (which only catches identical lines) would rarely fire here — instead,
// PASS lines are counted and summarized at flush, the same approach
// PytestFilter already uses for its PASSED lines.
const PASS_RE = /^--- PASS:/;
const FAIL_RE = /^--- FAIL:/;
// Final per-package summary line: "ok      example.com/mod   0.123s" or
// "FAIL    example.com/mod   0.123s".
const PACKAGE_SUMMARY_RE = /^(ok|FAIL)\s+\S+\s+[\d.]+s/;
// "go: downloading module@version" / "go: extracting module@version" —
// module-fetch noise from `go build`/`go test` resolving dependencies,
// unrelated to test/build results.
const MODULE_FETCH_RE = /^go:\s+(downloading|extracting)\s/;
/** go test/build profile: drops === RUN and module-fetch noise, counts/collapses PASS lines, keeps failures/summary. */
export class GoTestFilter {
    passedCount = 0;
    processLine(line, emit) {
        if (RUN_RE.test(line) || MODULE_FETCH_RE.test(line))
            return;
        if (PASS_RE.test(line)) {
            this.passedCount++;
            return;
        }
        if (FAIL_RE.test(line) || PACKAGE_SUMMARY_RE.test(line) || line === "FAIL" || line === "PASS") {
            this.flushPassed(emit);
            emit(line);
            return;
        }
        this.flushPassed(emit);
        emit(line);
    }
    flushPassed(emit) {
        if (this.passedCount > 0) {
            emit(`(${this.passedCount} passing tests collapsed)`);
            this.passedCount = 0;
        }
    }
    flush(emit) {
        this.flushPassed(emit);
    }
    onExit(exitCode, emit) {
        if (exitCode !== 0 && exitCode !== null) {
            emit(`--- go exited with code ${exitCode} ---`);
        }
    }
}
