import { BlockRepeatCollapser } from "./blockRepeat.js";
const ERROR_RE = /\b(error|fail(?:ed|ure)?|exception|traceback)\b/i;
// A stack-trace continuation line: indented, starting with "at " (JS/Node)
// or "File " (Python) — these follow an error line and belong to the same
// logical block, so an error line immediately followed by one of these is
// the start of a multi-line block rather than a standalone error.
const TRACE_CONTINUATION_RE = /^\s+(at\s+\S|File\s+["'])/;
const PROGRESS_RE = /\r|\[=*>?\s*\]\s*\d{1,3}%|^\s*\d{1,3}%\s*\|/;
const FIRST_KEEP = 5;
const LAST_WINDOW = 20;
const REPEAT_THRESHOLD = 3;
function normalize(line) {
    return line.replace(/\d+/g, "#").trim();
}
/** Fallback filter: collapses repeated lines and structurally-identical multi-line error blocks, drops progress spam, always keeps errors and head/tail. */
export class GenericFilter {
    index = 0;
    pending = null;
    recentWindow = [];
    emittedIndices = new Set();
    // An error line followed by indented stack-trace continuation lines
    // (" at ..." / "File ...") forms one logical block — e.g. repeated
    // "Connection timeout" errors with identical stack traces but a
    // different request number each time. RepeatCollapser-style exact-match
    // (above) can't group these since each line differs; this tracks
    // whether the current run of emitted error/trace lines is still "inside
    // a block" so the real emit can be deferred into BlockRepeatCollapser
    // instead of going straight to emitTracked.
    inErrorBlock = false;
    blocks = new BlockRepeatCollapser();
    processLine(line, emit) {
        this.index++;
        const currentIndex = this.index;
        this.recentWindow.push({ index: currentIndex, line });
        if (this.recentWindow.length > LAST_WINDOW)
            this.recentWindow.shift();
        if (currentIndex <= FIRST_KEEP) {
            this.flushPending(emit);
            this.exitErrorBlock(emit);
            this.emitTracked(currentIndex, line, emit);
            return;
        }
        if (PROGRESS_RE.test(line)) {
            return;
        }
        if (ERROR_RE.test(line)) {
            this.flushPending(emit);
            this.emittedIndices.add(currentIndex);
            this.blocks.startBlock(emit);
            this.blocks.pushLine(line);
            this.inErrorBlock = true;
            return;
        }
        if (this.inErrorBlock && TRACE_CONTINUATION_RE.test(line)) {
            this.emittedIndices.add(currentIndex);
            this.blocks.pushLine(line);
            return;
        }
        this.exitErrorBlock(emit);
        const normalized = normalize(line);
        if (this.pending && this.pending.normalized === normalized) {
            this.pending.lines.push({ index: currentIndex, line });
            return;
        }
        this.flushPending(emit);
        this.pending = { normalized, lines: [{ index: currentIndex, line }] };
    }
    // Ends the current error block (if any) — called whenever a line that
    // isn't part of a trace continuation is about to be processed, so a
    // buffered block is never left pending indefinitely waiting for a
    // follow-up that isn't coming.
    exitErrorBlock(emit) {
        if (!this.inErrorBlock)
            return;
        this.inErrorBlock = false;
        this.blocks.exitBlockContext(emit);
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
        this.exitErrorBlock(emit);
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
