const ERROR_RE = /\b(error|fail(?:ed|ure)?|exception|traceback)\b/i;
const PROGRESS_RE = /\r|\[=*>?\s*\]\s*\d{1,3}%|^\s*\d{1,3}%\s*\|/;
const FIRST_KEEP = 5;
const LAST_WINDOW = 20;
const REPEAT_THRESHOLD = 3;
function normalize(line) {
    return line.replace(/\d+/g, "#").trim();
}
/** Fallback filter: collapses repeated lines, drops progress spam, always keeps errors and head/tail. */
export class GenericFilter {
    index = 0;
    pending = null;
    recentWindow = [];
    emittedIndices = new Set();
    processLine(line, emit) {
        this.index++;
        const currentIndex = this.index;
        this.recentWindow.push({ index: currentIndex, line });
        if (this.recentWindow.length > LAST_WINDOW)
            this.recentWindow.shift();
        if (currentIndex <= FIRST_KEEP) {
            this.flushPending(emit);
            this.emitTracked(currentIndex, line, emit);
            return;
        }
        if (PROGRESS_RE.test(line)) {
            return;
        }
        if (ERROR_RE.test(line)) {
            this.flushPending(emit);
            this.emitTracked(currentIndex, line, emit);
            return;
        }
        const normalized = normalize(line);
        if (this.pending && this.pending.normalized === normalized) {
            this.pending.lines.push({ index: currentIndex, line });
            return;
        }
        this.flushPending(emit);
        this.pending = { normalized, lines: [{ index: currentIndex, line }] };
    }
    emitTracked(index, line, emit) {
        this.emittedIndices.add(index);
        emit(line);
    }
    flushPending(emit) {
        if (!this.pending)
            return;
        const { lines } = this.pending;
        if (lines.length >= REPEAT_THRESHOLD) {
            this.emittedIndices.add(lines[0].index);
            emit(`${lines[0].line} (×${lines.length})`);
        }
        else {
            for (const { index, line } of lines)
                this.emitTracked(index, line, emit);
        }
        this.pending = null;
    }
    flush(emit) {
        this.flushPending(emit);
    }
    onExit(exitCode, emit) {
        if (exitCode === 0 || exitCode === null)
            return;
        const missing = this.recentWindow.filter((e) => !this.emittedIndices.has(e.index));
        if (missing.length === 0)
            return;
        emit("--- last lines before exit (non-zero exit code) ---");
        for (const entry of missing)
            emit(entry.line);
    }
}
