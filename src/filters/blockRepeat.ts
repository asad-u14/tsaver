import type { Emit } from "./types.js";

// A more aggressive normalization than RepeatCollapser's digit-only
// replacement: also blanks out quoted string literals (variable values,
// assertion details), hex-like tokens (addresses, hashes, object ids), and
// the one name that's expected to differ between two otherwise-identical
// blocks — the test/function name itself, in the grammatical slots it
// actually appears in (a bare line, or right after `def`/`function`) —
// since that's exactly what varies between e.g. two different tests
// raising the same exception with the same traceback shape.
function normalizeLine(line: string): string {
  return line
    .replace(/"[^"]*"|'[^']*'/g, "<str>")
    .replace(/\b0x[0-9a-fA-F]+\b/g, "<hex>")
    .replace(/^(\s*)([A-Za-z_]\w*)\s*$/, "$1<name>")
    .replace(/\b(def|function)\s+[A-Za-z_]\w*/g, "$1 <name>")
    .replace(/\d+/g, "#")
    .trim();
}

/** The structural signature of a multi-line block: normalized lines joined, ignoring specifics like values/paths/line numbers. */
function blockSignature(lines: readonly string[]): string {
  return lines.map(normalizeLine).join("\n");
}

const DEFAULT_THRESHOLD = 2;

/**
 * Collapses consecutive blocks that share the same structural signature —
 * e.g. several test failures with the same exception type and traceback
 * shape but different line numbers/variable values/test names — into one
 * representative block plus a count of how many more had the same shape.
 *
 * Unlike RepeatCollapser (single lines, exact match after digit
 * normalization), this operates on caller-delimited multi-line blocks: the
 * caller calls `startBlock()` whenever it recognizes the start of a new
 * logical block (e.g. a test failure header), then `pushLine()` for each
 * line belonging to that block. A block of fewer than 2 lines is never
 * collapsed — a single line has nothing "structural" to match beyond what
 * RepeatCollapser already does.
 */
export class BlockRepeatCollapser {
  private currentBlock: string[] = [];
  private pendingBlock: string[] | null = null;
  private pendingSignature: string | null = null;
  private pendingCount = 0;
  private readonly threshold: number;

  constructor(threshold = DEFAULT_THRESHOLD) {
    this.threshold = threshold;
  }

  /** Call when a new block is about to start — may defer the just-closed block pending a repeat comparison against this new one. */
  startBlock(emit: Emit): void {
    this.closeCurrentBlock(emit);
  }

  /**
   * Call when leaving block context entirely (a non-block line is about to
   * be emitted) — unlike `startBlock`, this flushes everything immediately
   * rather than leaving a block pending, since there's no next block left
   * to compare it against. Without this, a block closed by `startBlock`
   * stays buffered until the *next* block (or final `flush`) arrives,
   * which would otherwise let an interleaved non-block line jump ahead of
   * it in emission order.
   */
  exitBlockContext(emit: Emit): void {
    this.closeCurrentBlock(emit);
    this.flushPending(emit);
  }

  pushLine(line: string): void {
    this.currentBlock.push(line);
  }

  private closeCurrentBlock(emit: Emit): void {
    if (this.currentBlock.length === 0) return;

    if (this.currentBlock.length < 2) {
      this.flushPending(emit);
      for (const l of this.currentBlock) emit(l);
      this.currentBlock = [];
      return;
    }

    const signature = blockSignature(this.currentBlock);
    if (this.pendingSignature === signature) {
      this.pendingCount++;
      this.currentBlock = [];
      return;
    }

    this.flushPending(emit);
    this.pendingBlock = this.currentBlock;
    this.pendingSignature = signature;
    this.pendingCount = 1;
    this.currentBlock = [];
  }

  private flushPending(emit: Emit): void {
    if (!this.pendingBlock) return;
    if (this.pendingCount >= this.threshold) {
      for (const l of this.pendingBlock) emit(l);
      const more = this.pendingCount - 1;
      emit(`(previous block repeated ${more} more time${more === 1 ? "" : "s"} with the same structure)`);
    } else {
      for (let i = 0; i < this.pendingCount; i++) {
        for (const l of this.pendingBlock) emit(l);
      }
    }
    this.pendingBlock = null;
    this.pendingSignature = null;
    this.pendingCount = 0;
  }

  /** Must be called once, after the last line of the last block has been pushed. */
  flush(emit: Emit): void {
    this.closeCurrentBlock(emit);
    this.flushPending(emit);
  }
}
