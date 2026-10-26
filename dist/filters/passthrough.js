/** No-op filter: emits every line unchanged. Used when a filter has been adaptively disabled. */
export class PassthroughFilter {
    processLine(line, emit) {
        emit(line);
    }
    flush(_emit) { }
    onExit(_exitCode, _emit) { }
}
