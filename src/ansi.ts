// Matches ANSI/VT100 escape sequences — CSI color/cursor codes (ESC [ ... letter)
// and OSC sequences (ESC ] ... BEL) — the two forms real CLI tools (colored
// test runners, progress bars, terminal hyperlinks) actually emit.
const ANSI_RE =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~])/g;

export function stripAnsi(line: string): string {
  return line.replace(ANSI_RE, "");
}
