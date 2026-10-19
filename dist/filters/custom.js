import { RepeatCollapser } from "./repeat.js";
/** User-defined filter loaded from a .toml file: keep/drop regex lists, everything else repeat-collapsed. */
export class CustomFilter {
    keepRes;
    dropRes;
    collapser = new RepeatCollapser();
    sawAnyLine = false;
    kept = false;
    constructor(config) {
        this.keepRes = (config.keep ?? []).map((p) => new RegExp(p));
        this.dropRes = (config.drop ?? []).map((p) => new RegExp(p));
    }
    processLine(line, emit) {
        this.sawAnyLine = true;
        if (this.dropRes.some((re) => re.test(line))) {
            return;
        }
        if (this.keepRes.some((re) => re.test(line))) {
            this.collapser.flush(emit);
            this.kept = true;
            emit(line);
            return;
        }
        this.collapser.push(line, emit);
    }
    flush(emit) {
        this.collapser.flush(emit);
    }
    onExit(exitCode, emit) {
        if (exitCode !== 0 && exitCode !== null && this.sawAnyLine && !this.kept) {
            emit(`--- command exited with code ${exitCode}, no keep-pattern matched ---`);
        }
    }
}
