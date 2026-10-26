// git status prints a hint line in parentheses under almost every section
// header ("use \"git add <file>...\" to update what will be committed"),
// always indented and always wrapped in (use "..."). These are pure
// boilerplate — the same fixed text on every invocation — never signal.
const HINT_RE = /^\s*\(use "git [^"]+"[^)]*\)\s*$/;
// Real git clone/fetch/pull progress lines, e.g.:
//   remote: Counting objects:  42% (21/52)
//   Receiving objects:  42% (21/52), 1.2 MiB | 800 KiB/s
// These always carry a \r (overwritten in place in a real terminal) once
// readline strips the trailing \n — GenericFilter's repeat-collapsing
// already handles exact repeats reasonably, but dropping intermediate
// percentage ticks entirely (keeping only the final 100% line) is cleaner
// for a dedicated git profile.
const PROGRESS_RE = /\r|^(remote: )?(Counting|Compressing|Receiving|Resolving) objects:\s+\d{1,3}%/;
/** git profile: drops status's boilerplate (use "...") hint lines and clone/fetch progress ticks. */
export class GitFilter {
    processLine(line, emit) {
        if (HINT_RE.test(line) || PROGRESS_RE.test(line))
            return;
        emit(line);
    }
    flush(_emit) { }
    onExit(exitCode, emit) {
        if (exitCode !== 0 && exitCode !== null) {
            emit(`--- git exited with code ${exitCode} ---`);
        }
    }
}
