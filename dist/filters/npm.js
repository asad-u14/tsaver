const KEEP_RE = /^(npm error|npm ERR!|npm warn|added|removed|changed|found \d+ vulnerabilit)/i;
const DROP_RE = /^(npm notice|npm timing|⸨|⠁|⠂|⠄)/i;
const PROGRESS_RE = /\r/;
/** npm profile: keeps errors/warnings/install summary, drops notices/spinners/timing noise. */
export class NpmFilter {
    processLine(line, emit) {
        if (PROGRESS_RE.test(line) || DROP_RE.test(line))
            return;
        if (KEEP_RE.test(line) || /error|fail/i.test(line)) {
            emit(line);
            return;
        }
        emit(line);
    }
    flush(_emit) { }
    onExit(exitCode, emit) {
        if (exitCode !== 0 && exitCode !== null) {
            emit(`--- npm exited with code ${exitCode} ---`);
        }
    }
}
