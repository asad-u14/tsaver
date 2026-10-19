import type { Emit, Filter } from "./types.js";
import { RepeatCollapser } from "./repeat.js";

export interface CustomFilterConfig {
  command: string;
  keep?: string[];
  drop?: string[];
}

/** User-defined filter loaded from a .toml file: keep/drop regex lists, everything else repeat-collapsed. */
export class CustomFilter implements Filter {
  private keepRes: RegExp[];
  private dropRes: RegExp[];
  private collapser = new RepeatCollapser();
  private sawAnyLine = false;
  private kept = false;

  constructor(config: CustomFilterConfig) {
    this.keepRes = (config.keep ?? []).map((p) => new RegExp(p));
    this.dropRes = (config.drop ?? []).map((p) => new RegExp(p));
  }

  processLine(line: string, emit: Emit): void {
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

  flush(emit: Emit): void {
    this.collapser.flush(emit);
  }

  onExit(exitCode: number | null, emit: Emit): void {
    if (exitCode !== 0 && exitCode !== null && this.sawAnyLine && !this.kept) {
      emit(`--- command exited with code ${exitCode}, no keep-pattern matched ---`);
    }
  }
}
