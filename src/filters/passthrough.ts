import type { Emit, Filter } from "./types.js";

/** No-op filter: emits every line unchanged. Used when a filter has been adaptively disabled. */
export class PassthroughFilter implements Filter {
  processLine(line: string, emit: Emit): void {
    emit(line);
  }

  flush(_emit: Emit): void {}

  onExit(_exitCode: number | null, _emit: Emit): void {}
}
