export type Emit = (line: string) => void;

/**
 * A streaming filter processes one line at a time and decides whether to
 * keep, drop, or buffer it. `flush` is called once at process exit so any
 * buffered state (e.g. pending repeat counts) gets a chance to emit, and
 * `onExit` lets the filter guarantee failure context survives even if
 * earlier heuristics would've dropped it.
 */
export interface Filter {
  processLine(line: string, emit: Emit): void;
  flush(emit: Emit): void;
  onExit(exitCode: number | null, emit: Emit): void;
}
