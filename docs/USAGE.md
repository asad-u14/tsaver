# tsaver — full usage reference

tsaver is a local, on-disk token/output saver for AI coding agents. It wraps noisy CLI commands, compacts large JSON (e.g. MCP tool responses), optimizes files for agent consumption (PDFs, notebooks, images), builds a lightweight code index, and keeps a local dashboard — all without any telemetry, cloud dependency, or network calls. Everything lives under `~/.tsaver/` and `.tsaver/` (project-local).

## Contents
1. [Install](#install)
2. [`tsaver run`](#tsaver-run)
3. [`tsaver read`](#tsaver-read)
4. [`tsaver mcp`](#tsaver-mcp)
5. [`tsaver filters gaps`](#tsaver-filters-gaps)
6. [`tsaver report`](#tsaver-report)
7. [`tsaver retrieve`](#tsaver-retrieve)
8. [`tsaver init --claude`](#tsaver-init---claude)
9. [`tsaver graph`](#tsaver-graph)
10. [`tsaver dashboard`](#tsaver-dashboard)
11. [Custom filters](#custom-filters)
12. [History storage](#history-storage)
13. [Troubleshooting](#troubleshooting)

---

## Install

```bash
git clone git@gitlab.com:ai-projects-14/tsaver.git
cd tsaver
npm install
npm run build
npm link
```

`npm link` makes the `tsaver` command available globally (symlinked into your npm global bin).

> **Do not use** `npm install -g git+ssh://git@gitlab.com/...`. npm's git installer fetches GitLab packages via the `repository/archive.tar.gz` REST API instead of a real `git clone`, and that endpoint can 404 on some networks (observed on a corporate network with TLS interception). Clone + `npm link` avoids this entirely.

To update later:
```bash
cd /path/to/your/tsaver/clone
git pull
npm install
npm run build
```
(No need to re-run `npm link` — it's already linked, rebuilding in place is enough.)

---

## `tsaver run`

```
tsaver run [--stats] -- <command> [args...]
```

Spawns `<command>`, captures stdout/stderr, and streams each line through a **filter** before printing it — stripping noise while guaranteeing failures survive. Exit code is propagated unchanged.

### Filter selection order
1. A custom `.toml` filter matching the command name (see [Custom filters](#custom-filters)).
2. A built-in profile, if one exists for the command name: `pytest` / `py.test`, `npm`.
3. Otherwise, the **generic filter** (fallback).

### Generic filter behavior
- Always keeps the **first 5 lines** and the **last 20 lines** of output.
- Collapses **3 or more** consecutive near-duplicate lines (digits normalized to `#` before comparing) into one line with a `(×N)` suffix.
- Drops lines matching progress-bar/spinner patterns: carriage returns, `[===>   ] 42%`, or a bare `NN% |`.
- Always keeps any line matching `/\b(error|fail(?:ed|ure)?|exception|traceback)\b/i`.
- If the process exits non-zero, appends any of the last-20-window lines that weren't already emitted, under a `--- last lines before exit (non-zero exit code) ---` marker — so failure context is never silently dropped.

### `pytest` profile
Keeps lines starting with `FAILED`, `ERROR`, `E ` (assertion detail), and the summary line (`== N failed, M passed ==`). Collapses passing-test dots/`PASSED` lines into a single `N passed` (or `(N passing tests collapsed)`) note.

### `npm` profile
Keeps `npm error`/`npm ERR!`/`npm warn`/install-summary lines and anything matching `error|fail`. Drops `npm notice`/`npm timing`/spinner lines. Appends a marker if the process exits non-zero.

### `--stats`
Prints a before/after summary to **stderr** (so it doesn't pollute the piped stdout):
```
tsaver stats
  lines                   32 -> 8  (75.0% reduction)
  bytes                   367 -> 90  (75.5% reduction)
  words (approx. tokens)  63 -> 16  (74.6% reduction)
```
"Words" is a whitespace-split count used as an approximate token proxy — not an actual tokenizer count.

### History
Every `run` writes a `kind: "run"` entry (see [History storage](#history-storage)) with the full raw and filtered text, the exit code, which filter handled it, and `source: "hook"` if invoked via the Claude Code hook (`TSAVER_HOOK_SOURCE=1` env var set), otherwise `"manual"`.

### Examples
```bash
tsaver run --stats -- npm install
tsaver run --stats -- pytest
tsaver run -- cargo build
```

---

## `tsaver read`

```
tsaver read [--stats] <path>
```

Optimizes a file for an agent to consume, dispatching by file extension:

| Extension | Behavior |
|---|---|
| `.pdf` | Extracts plain text via `pdf-parse`. |
| `.ipynb` | Converts to Markdown: markdown cells pass through as-is, code cells become fenced code blocks, and any cell output text longer than 20 lines is truncated with a `(truncated, N more lines)` marker. |
| `.png` `.jpg` `.jpeg` `.gif` `.webp` | Resizes (if larger than 1024px on the longest side) via `jimp` and writes `<name>.optimized.<ext>` alongside the original. Prints the new dimensions and before/after byte size. |
| anything else | Passthrough — prints the file as-is, 0% reduction, still logged to history. |

### Examples
```bash
tsaver read --stats report.pdf
tsaver read notebook.ipynb
tsaver read screenshot.png
```

History entry: `kind: "read"`, with `rawPath` set to the original absolute path (so [`retrieve`](#tsaver-retrieve) re-reads the file rather than duplicating its bytes into history).

---

## `tsaver mcp`

```
tsaver mcp [--stats] [--max-string N] [--max-array N] [file]
```

Compacts a JSON document — e.g. a captured MCP tool response — while **guaranteeing the output stays valid JSON**. Reads from `file` if given, otherwise stdin.

- Strings longer than `--max-string` (default **500**) are truncated with an inline `"...(N more chars)"` suffix.
- Arrays longer than `--max-array` (default **20**) keep the **first 3 and last 3** items and splice in a single string marker (`"...(N more items)"`) describing how many were dropped.
- Objects and nested values are processed recursively.
- If the input isn't valid JSON, tsaver reports the parse error and exits 1 without writing anything.

### Examples
```bash
curl -s https://api.example.com/big-response.json | tsaver mcp --stats
tsaver mcp --stats --max-string 200 --max-array 10 response.json
```

History entry: `kind: "mcp"`, label is the file path or `<stdin>`, `rawText` holds the original uncompacted JSON text (recoverable via `retrieve`).

---

## `tsaver filters gaps`

```
tsaver filters gaps [--top N]
```

Scans history for `run` entries that fell back to the **generic** filter (i.e. no custom or built-in profile matched), groups them by command basename, and ranks by total raw bytes processed — showing you which commands would benefit most from a custom `.toml` filter. Default `--top` is **10**.

```
Commands without a custom filter (generic fallback)
  node                 runs=4  raw_bytes=388  avg_reduction=71.4%

Add .tsaver/filters/<command>.toml to improve filtering for these.
```

---

## `tsaver report`

```
tsaver report
```

Prints an aggregate summary across all history: total entries, per-kind (`run`/`read`/`mcp`) byte counts and reduction %, and a "Recent entries" list.

- Entries with `source: "hook"` (i.e. routed through the Claude Code hook) are **counted in the aggregate stats** but **omitted from the "Recent entries" list**, so that list stays focused on commands you ran yourself. A line at the bottom notes how many hook entries were omitted.

---

## `tsaver retrieve`

```
tsaver retrieve <id>
```

Recovers the **original, unfiltered** content for any past history entry by its id (shown in `tsaver report`'s "Recent entries" or in the dashboard).

- For `run`/`mcp` entries: prints the stored `rawText` (the full captured output/input before filtering).
- For `read` entries: re-reads the original file from its stored `rawPath` (fails with a clear message if that file no longer exists).

```bash
tsaver retrieve a1b2c3d4e5
```

---

## `tsaver init --claude`

```
tsaver init --claude
```

Installs a Claude Code `PreToolUse` hook on the `Bash` tool so **every Bash command Claude Code runs — in the terminal or in the VS Code extension — is automatically rerouted through `tsaver run`** before its output reaches Claude's context. No manual prefixing needed.

### What it does
- Writes `~/.claude/hooks/tsaver-reroute.cjs` (mode `0o755`).
- Merges a `hooks.PreToolUse` entry into `~/.claude/settings.json` — **merges, never overwrites** existing settings.
- Re-running `tsaver init --claude` always refreshes the hook script's content (even if the settings.json entry already exists) — useful if tsaver's own install location has moved.

### Why the hook embeds an absolute path
The generated hook script invokes `node '<resolved absolute path to dist/cli.js>' run -- bash -c '<command>'` rather than a bare `tsaver` command. This was a real bug found and fixed in development: Claude Code's hook commands can run in a non-interactive shell context that never sources the shell init files a version manager like `nvm` relies on to put `tsaver` on `PATH`. Relying on `PATH` here caused every single Bash call to silently fail, freezing the session (since even the recovery commands needed that same broken `tsaver`). The absolute-path fix makes the hook immune to PATH/shell-context issues.

### What the hook does NOT reroute
Commands matching this pattern run **directly, unmodified**, because wrapping them in a subshell would silently break their effect on the rest of the session:
```
cd, pushd, popd, export, source, . (dot), alias, unset, declare, local, readonly, set, exec
```

### Required manual step
After running `tsaver init --claude`, Claude Code must reload hooks — either open `/hooks` once in the session, or restart Claude Code. This isn't automatic.

### Marking hook-originated runs
The generated hook sets `TSAVER_HOOK_SOURCE=1` on the commands it reroutes. `tsaver run` reads that env var and records `source: "hook"` on the history entry, which is what lets `report` and the dashboard distinguish "Claude ran this automatically" from "I typed this myself."

---

## `tsaver graph`

```
tsaver graph build [--dir <path>]
tsaver graph query <symbol> [--dir <path>]
```

A lightweight, **regex-based heuristic** symbol index — not an AST, not tree-sitter. It does not understand scope, types, or shadowing; it pattern-matches lines of text. Expect occasional **false positives** (a common identifier matching unrelated text/comments) and **false negatives** (unusual syntax the patterns don't anticipate). Treat its output as a fast pointer toward likely locations, not ground truth — always sanity-check before relying on it for anything like a refactor.

### Supported languages
- **JS/TS** (`.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs`): `function NAME`, `class NAME`, `const/let NAME = (...) =>`, `const/let NAME = function`, `import {...}/* as X/Default from "..."`, `require("...")`.
- **Python** (`.py`): `def NAME`, `class NAME`, `import X`, `from X import Y`.
- Any other extension is skipped entirely — no generic fallback is attempted, since untyped regex over arbitrary languages produces more noise than signal.

### `build`
Walks the target directory (default: current working directory), skipping `node_modules`, `.git`, `dist`, `build`, `out`, `.tsaver`, `coverage`, and any hidden directory. Writes the index to `<dir>/.tsaver/graph.json`. Prints a summary: files scanned, symbol/import/reference counts, elapsed time.

Re-run `build` after significant code changes — the index does not auto-refresh.

### `query`
Looks up a name against the last-built index:
1. Exact (case-sensitive) match first.
2. If nothing matches exactly, falls back to a case-insensitive substring match.

Output is grouped into **Definitions** (kind, file:line), **Imported by** (which files import a module whose imported names matched, or whose module path substring-matches the query), and **References** (every other line where the symbol name appears as a whole word, capped at 50 shown).

### Examples
```bash
tsaver graph build
tsaver graph query selectFilter
tsaver graph build --dir ~/other-project
tsaver graph query MyClass --dir ~/other-project
```

---

## `tsaver dashboard`

```
tsaver dashboard [--port 4173]
```

Starts a local-only web dashboard over the same history data `tsaver report` uses.

- **Binds to `127.0.0.1` only** — nothing is exposed on the network, no data leaves the machine.
- Built on Node's built-in `http` module — no new dependencies, no bundler.
- Routes: `GET /` (the dashboard page), `GET /api/summary` (same aggregate shape as `report`), `GET /api/history?limit=N` (most recent N entries, JSON).
- The page auto-refreshes every **5 seconds** via `fetch`.
- Attempts to open your default browser automatically (`open` on macOS, `start` on Windows, `xdg-open` on Linux) — if that fails silently (no opener available), the printed URL still works manually.
- Stop with Ctrl+C.
- If the port is already in use, prints a clear error and suggests `--port <other>`.

```bash
tsaver dashboard
tsaver dashboard --port 5000
```

---

## Custom filters

Define keep/drop rules for a specific command via a TOML file:

```toml
# .tsaver/filters/mytool.toml
command = "mytool"
keep = ["^ERROR", "^FAIL"]
drop = ["^progress"]
```

- **Project-local** (`.tsaver/filters/*.toml`, relative to current working directory) **override global** (`~/.tsaver/filters/*.toml`) filters for the same `command` name.
- Each `keep`/`drop` entry is a JavaScript regex source string (no delimiters, e.g. `"^ERROR"` not `/^ERROR/`).
- **Order of operations per line**: drop-match wins first (line is discarded) → keep-match second (line is always emitted, flushing any pending repeat-collapse buffer first) → otherwise the line goes through the same repeat-collapsing logic as the generic filter (3+ near-identical consecutive lines collapse to one `(×N)` line).
- If the command exits non-zero and no `keep` pattern ever matched anything, a marker line is appended noting the exit code — so a silent failure in an otherwise fully-dropped/collapsed stream is never invisible.

---

## History storage

Every `run`, `read`, and `mcp` invocation writes one JSON file to `~/.tsaver/history/<id>.json` (10-char hex id). Shape:

```ts
{
  id: string;
  timestamp: string;        // ISO 8601
  kind: "run" | "read" | "mcp";
  label: string;             // command/file, truncated to one line + "...(+N more lines)" if long/multi-line
  exitCode?: number | null;  // run only
  filterName?: string;       // which filter handled it: "generic" | "pytest" | "npm" | "custom:<name>"
  source?: "hook" | "manual";// run only — whether it came via the Claude Code hook
  stats: {
    rawLines, filteredLines, rawBytes, filteredBytes, rawWords, filteredWords: number;
  };
  rawText?: string;   // run/mcp — full original content, recoverable via `retrieve`
  rawPath?: string;   // read — original file path, re-read by `retrieve`
  filteredText: string;
}
```

Nothing is ever deleted automatically — history accumulates until you remove `~/.tsaver/history/` yourself.

---

## Troubleshooting

### `npm install -g git+ssh://git@gitlab.com/...` fails with `SELF_SIGNED_CERT_IN_CHAIN`, a 404 on `archive.tar.gz`, or extraction errors
npm's git installer for GitLab tries to fetch the package via GitLab's `repository/archive.tar.gz` REST API rather than a real `git clone`. On some networks (notably corporate networks with TLS-intercepting proxies) that endpoint returns a 404, and npm's tar extraction then fails on the garbage response. **Use clone + `npm link` instead** (see [Install](#install)) — it doesn't touch that API at all.

### `tsaver: command not found` after installing, or it suddenly stops working
Usually one of:
- **A stale/dangling global symlink.** If a previous `npm install -g git+ssh://...` attempt partially succeeded, `node_modules/tsaver` in your global npm folder may point at a now-deleted npm temp-cache directory. Fix: `npm uninstall -g tsaver`, remove any leftover dangling symlink at `$(dirname "$(which node)")/tsaver`, then reinstall via clone + `npm link`.
- **Lost executable bit.** If `dist/cli.js` lost its `+x` permission (can happen after certain `npm install`/git operations), running `tsaver` fails with "permission denied." Fix: `chmod +x dist/cli.js` in your clone (or just re-run `npm run build`, which regenerates it, followed by `chmod +x dist/cli.js` if needed).
- **Local changes blocking `git pull`.** If `dist/cli.js` or `package-lock.json` have uncommitted local changes (e.g. from a permission-bit fix), `git pull` will refuse to merge. Fix: `git checkout -- dist/cli.js package-lock.json` (safe — both are regenerated by `npm install`/`npm run build`) then pull again.

### `git pull`/`git fetch` times out over SSH (`ssh: connect to host gitlab.com port 22: Operation timed out`)
Some corporate networks block outbound SSH (port 22) entirely. Fetch over HTTPS instead for one-off access without changing your configured remote:
```bash
git pull https://gitlab.com/ai-projects-14/tsaver.git main
```

### The Claude Code hook (`tsaver init --claude`) doesn't seem to be filtering anything
Claude Code only reloads hook configuration at session start or when you open `/hooks` — editing `~/.claude/settings.json` (including via `tsaver init --claude`) has no effect on an already-running session until one of those happens.
