import { RepeatCollapser } from "./repeat.js";
// Real cargo build/test noise lines, e.g.:
//   Updating crates.io index
//   Locking 7 packages to highest Rust 1.99.0 compatible versions
//   Adding serde v1.0.229
//   Downloading crates ...
//   Downloaded serde v1.0.229
//   Compiling serde v1.0.229
// None of these carry test/build-result signal on their own — they're the
// per-dependency progress trail, which is exactly the noise this filter
// exists to collapse (one line per crate in a real build, often dozens).
const NOISE_RE = /^\s*(Updating|Locking|Adding|Downloading|Downloaded|Compiling)\s/;
// "Finished `dev` profile [...] target(s) in 4.53s" — the one-line build
// summary, always kept.
const FINISHED_RE = /^\s*Finished\s/;
// Real cargo test's final line, e.g. "test result: FAILED. 2 passed; 1
// failed; ..." or "test result: ok. 3 passed; 0 failed; ...".
const TEST_RESULT_RE = /^test result:/;
const PROGRESS_RE = /\r/;
/** cargo profile: drops per-crate Updating/Adding/Downloading/Compiling noise, keeps warnings/errors/results. */
export class CargoFilter {
    collapser = new RepeatCollapser();
    processLine(line, emit) {
        if (PROGRESS_RE.test(line) || NOISE_RE.test(line))
            return;
        if (FINISHED_RE.test(line) || TEST_RESULT_RE.test(line)) {
            this.collapser.flush(emit);
            emit(line);
            return;
        }
        this.collapser.push(line, emit);
    }
    flush(emit) {
        this.collapser.flush(emit);
    }
    onExit(exitCode, emit) {
        if (exitCode !== 0 && exitCode !== null) {
            emit(`--- cargo exited with code ${exitCode} ---`);
        }
    }
}
