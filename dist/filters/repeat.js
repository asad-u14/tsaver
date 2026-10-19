function normalize(line) {
    return line.replace(/\d+/g, "#").trim();
}
/** Collapses runs of REPEAT_THRESHOLD+ consecutive normalized-identical lines into `<line> (×N)`. */
export class RepeatCollapser {
    normalized = null;
    lines = [];
    threshold;
    constructor(threshold = 3) {
        this.threshold = threshold;
    }
    push(line, emit) {
        const normalized = normalize(line);
        if (this.normalized === normalized) {
            this.lines.push(line);
            return;
        }
        this.flush(emit);
        this.normalized = normalized;
        this.lines = [line];
    }
    flush(emit) {
        if (this.lines.length === 0)
            return;
        if (this.lines.length >= this.threshold) {
            emit(`${this.lines[0]} (×${this.lines.length})`);
        }
        else {
            for (const line of this.lines)
                emit(line);
        }
        this.lines = [];
        this.normalized = null;
    }
}
