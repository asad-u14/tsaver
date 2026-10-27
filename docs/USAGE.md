# tsaver — full usage reference

tsaver is a local, on-disk token/output saver for AI coding agents. It wraps noisy CLI commands, compacts large JSON (e.g. MCP tool responses), optimizes files for agent consumption (PDFs, notebooks, images), builds a lightweight code index, and keeps a local dashboard — all without any telemetry, cloud dependency, or network calls. Everything lives under `~/.tsaver/` and `.tsaver/` (project-local).

## Contents
1. [Why tsaver exists](#why-tsaver-exists)
2. [Install](#install)
3. [`tsaver run`](#tsaver-run)
4. [`tsaver read`](#tsaver-read)
5. [`tsaver mcp`](#tsaver-mcp)
6. [`tsaver filters gaps`](#tsaver-filters-gaps)
7. [`tsaver report`](#tsaver-report)
8. [`tsaver retrieve`](#tsaver-retrieve)
9. [`tsaver history clear`](#tsaver-history-clear)
10. [`tsaver init --claude`](#tsaver-init---claude)
11. [`tsaver graph`](#tsaver-graph)
12. [`tsaver dashboard`](#tsaver-dashboard)
13. [Custom filters](#custom-filters)
14. [How tsaver actually works](#how-tsaver-actually-works)
15. [Troubleshooting](#troubleshooting)

---

## Why tsaver exists

AI coding agents like Claude Code spend a large share of their context window — and your token budget — reading raw command output that has nothing to do with the task at hand. A single `npm install` or `pytest` run can dump hundreds of lines of progress bars, repeated log lines, and install chatter into the conversation, and every one of those lines is tokens the model has to read before it can get to the one line that actually matters: the error, the failure, the summary.

The same problem shows up in other forms: an MCP tool can return a JSON blob with megabytes of nested data when only a handful of fields are relevant; a PDF or Jupyter notebook an agent needs to read might be mostly formatting and binary overhead; a repo-wide grep for "where is this function used" burns several tool calls that a small local index could answer in one.

tsaver sits between the agent and all of that noise. It wraps the commands an agent runs, compacts the data it reads, and keeps everything that got filtered out recoverable on disk — so you get the token savings without ever losing information for good. It runs entirely locally: no data leaves your machine, there's no telemetry, and nothing needs a network connection to work.

**Who this is for:** anyone running Claude Code (or another agent) against a real codebase, where routine commands — installs, test suites, builds, API calls — are quietly eating context on noise instead of signal. If you've ever watched an agent's context fill up with `PASSED` lines or spinner frames, that's the problem tsaver is built to fix.

---

## Install

```bash
git clone https://github.com/asad-u14/tsaver.git
cd tsaver
npm install
npm run build
npm link
```

`npm link` makes the `tsaver` command available globally (symlinked into your npm global bin).

You can also install directly from GitHub without a separate clone step:
```bash
npm install -g github:asad-u14/tsaver
```

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
tsaver run [--stats] [--dedupe] -- <command> [args...]
```

Spawns `<command>`, captures stdout/stderr, and streams each line through a **filter** before printing it — stripping noise while guaranteeing failures survive. Exit code is propagated unchanged.

`--dedupe`: buffers the filtered output instead of streaming it live, and compares it (by content hash) against the same command's last run within the past 30 minutes. If unchanged, prints a one-line `(unchanged since last run of this command within the last 30 minutes)` note instead of repeating the full filtered output — useful for an agent re-running the same status/check command repeatedly in one session. Off by default, since buffering means output isn't visible until the command finishes.

### Filtered output cap
Regardless of which filter runs, the **filtered** output a command can push is capped at **2,000 lines or 500,000 bytes**, whichever comes first — a long-running or watch-mode command with no natural quiet tail has no other limit on how much it pushes into an agent's context. Once hit, a `--- tsaver: filtered output exceeded the cap, rest dropped (use \`tsaver retrieve\` for the full original) ---` notice is appended and nothing further is emitted live. The **raw** side keeps accumulating in full regardless — `tsaver retrieve <id>` always recovers everything the command actually produced, capped output only affects what reaches the agent in real time.

### Filter selection order
1. A custom `.toml` filter matching the command name (see [Custom filters](#custom-filters)).
2. A built-in profile, if one exists for the command name: `pytest` / `py.test`, `npm`, `cargo`, `go`, `git`.
3. Otherwise, the **generic filter** (fallback).

### Adaptive filter disabling
If an agent calls `tsaver retrieve <id>` to recover a built-in filter's full original output **3 or more times**, that filter is treated as net-negative for the current situation — its compaction is costing an extra round-trip to undo — so it's automatically bypassed (unfiltered passthrough, recorded in history as e.g. `npm (disabled)`) for 24 hours, then re-enabled automatically. This only applies to built-in profiles, not the generic fallback (disabling generic would silently stop filtering every unmatched command, not just the one being retrieved).

### Generic filter behavior
- Always keeps the **first 5 lines** and the **last 20 lines** of output.
- Collapses **3 or more** consecutive near-duplicate lines (digits normalized to `#` before comparing) into one line with a `(×N)` suffix.
- Drops lines matching progress-bar/spinner patterns: carriage returns, `[===>   ] 42%`, or a bare `NN% |`.
- Always keeps any line matching `/\b(error|fail(?:ed|ure)?|exception|traceback)\b/i`.
- If the process exits non-zero, appends any of the last-20-window lines that weren't already emitted, under a `--- last lines before exit (non-zero exit code) ---` marker — so failure context is never silently dropped.

### `pytest` profile
- Drops the entire startup banner (`test session starts`, `platform`, `rootdir`, `configfile`, `plugins`, `collected N items`) — none of it is test-specific signal.
- Recognizes pytest's real default-mode progress lines (a file path followed by status characters and an optional `[ NN%]` marker, e.g. `tests/test_auth.py .......... [ 14%]`) and collapses them, along with `PASSED` lines, into a single `N passed` (or `(N passing tests collapsed)`) note.
- Keeps lines starting with `FAILED`, `ERROR`, `E ` (assertion detail), and the summary line (`N failed, M passed`) — with the `===`/`___` decoration around section headers and summaries stripped to just the label, and blank lines orphaned by a drop removed.
- A real pytest example (25 lines) reduces to 12 lines / 71.1% fewer bytes with this filter — see the [Boost comparison report](boost-comparison-report.html) for a verified line-by-line diff against a published reference output.

### `npm` profile
Drops `npm notice`/`npm timing`/spinner lines. Everything else (including `npm warn`/`npm error` lines) goes through the same repeat-collapser as the custom-filter fallback, so a deprecation warning repeated 40 times collapses to one `(×40)` line while a one-off warning or error is never delayed or hidden. Appends a marker if the process exits non-zero and this stream saw output.

### `cargo` profile
Drops the per-dependency `Updating`/`Locking`/`Adding`/`Downloading`/`Downloaded`/`Compiling` lines cargo prints for every crate in the build (often dozens on a cold build). Keeps warnings, errors, the `Finished ... target(s) in N.NNs` summary, and `test result: ...` lines untouched; repeated non-noise lines are collapsed the same way as the generic filter.

### `go` profile
Drops `=== RUN TestName` progress markers and `go: downloading`/`go: extracting` module-fetch noise. `--- PASS: TestName` lines are counted (not collapsed by exact match, since test names almost always differ) and summarized at flush as `(N passing tests collapsed)` — the same approach the pytest profile uses for `PASSED` lines. Keeps `--- FAIL: ...` lines, the final `PASS`/`FAIL` line, and the per-package `ok`/`FAIL  <module>  N.NNs` summary line untouched.

### `git` profile
Drops the boilerplate `(use "git ...")` hint lines `git status` prints under almost every section header, and intermediate `Counting/Compressing/Receiving/Resolving objects: NN%` progress ticks from clone/fetch/pull. Everything else (file lists, commit messages, diffs, errors) passes through unmodified.

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
tsaver read [--stats] [--cache] [--pages N-M] [--query <term>] <path>
```

Optimizes a file for an agent to consume, dispatching by file extension:

| Extension | Behavior |
|---|---|
| `.pdf` | Extracts plain text via `pdf-parse`. |
| `.ipynb` | Converts to Markdown: markdown cells pass through as-is, code cells become fenced code blocks, and any cell output text longer than 20 lines is truncated with a `(truncated, N more lines)` marker. |
| `.png` `.jpg` `.jpeg` `.gif` `.webp` | Resizes (if larger than 1024px on the longest side) via `jimp` and writes `<name>.optimized.<ext>` alongside the original. Prints the new dimensions and before/after byte size. |
| anything else | Passthrough — prints the file as-is, 0% reduction, still logged to history. |

### `--pages N-M`
PDFs only. Extracts only the given 1-indexed, inclusive page range (e.g. `--pages 1-5`) instead of the whole document — useful when an agent only needs one section of a large PDF. Invalid ranges (`last < first`, non-numeric) exit 1 with an error before any extraction happens.

### `--query <term>`
Filters the extracted/read content down to lines (or, for notebooks, cells) matching `<term>` (case-insensitive) plus 2 lines of surrounding context, merging overlapping matches and marking omitted gaps with `... (N lines omitted) ...`. Works for PDFs (applied after extraction), notebooks (matches against cell source or output text, keeping whole cells), and plain-text passthrough. No match prints `(no lines matching "<term>")` rather than nothing. Not applied to images.

### `--cache`
Instead of printing the optimized content to stdout, writes it to `~/.tsaver/cache/<hash>.md` (or, for images, uses the already-written `.optimized.<ext>` sibling file) and prints **only that path** on stdout. This is what the [Claude Code Read hook](#tsaver-init---claude) uses internally to redirect a `Read` tool call — it's not generally needed for interactive use.

For PDFs and notebooks, each cached extraction is recorded alongside a manifest of the source file's mtime and size. A later `--cache` call on the same path skips re-extraction entirely (and reports the same path) if the source hasn't changed since — relevant because the Claude Code Read hook can invoke `tsaver read --cache` on the same file repeatedly within one session. History still records a `read` entry on a cache hit, with the real original file size as "raw bytes" (not the already-extracted text's size). Doesn't apply to images, whose cache redirect is the resized image file itself.

Combining `--cache` with `--pages`/`--query` prints the partial content directly instead of writing/returning a cache path — caching a partial extraction under the same key as the full document would make the next unqualified `--cache` call silently return the narrower slice instead of the whole document.

### Examples
```bash
tsaver read --stats report.pdf
tsaver read notebook.ipynb
tsaver read screenshot.png
tsaver read --pages 1-5 big-report.pdf       # only pages 1 through 5
tsaver read --query "error" build-log.ipynb  # only cells/lines mentioning "error"
```

History entry: `kind: "read"`, with `rawPath` set to the original absolute path (so [`retrieve`](#tsaver-retrieve) re-reads the file rather than duplicating its bytes into history).

---

## `tsaver mcp`

```
tsaver mcp [--stats] [--pretty] [--max-string N] [--max-array N] [file]
```

Compacts a JSON document — e.g. a captured MCP tool response — while **guaranteeing the output stays valid JSON**. Reads from `file` if given, otherwise stdin.

- Strings longer than `--max-string` (default **500**) are truncated with an inline `"...(N more chars)"` suffix.
- Arrays longer than `--max-array` (default **20**) keep the **first 3 and last 3** items and splice in a single string marker (`"...(N more items)"`) describing how many were dropped.
- Objects with more than `--max-array` keys get the same treatment — first 3 and last 3 entries kept, the rest replaced with a single `"...(N more keys)"` marker key. This covers large object-keyed payloads (e.g. an npm registry response's `versions` map) that array-only truncation used to miss entirely.
- Output is **minified by default** — no indentation, since nothing reading it needs to be human-formatted. Pass `--pretty` for indented output when debugging interactively.
- If the input isn't valid JSON, tsaver reports the parse error and exits 1 without writing anything.
- Identical input (same raw JSON text and the same `--max-string`/`--max-array` options) is cached — a repeated call skips recompacting entirely and reuses the stored result, useful for an agent polling the same MCP tool call repeatedly. `--pretty` doesn't affect the cache key, since it only changes formatting of an already-cached result.

### Examples
```bash
curl -s https://api.example.com/big-response.json | tsaver mcp --stats
tsaver mcp --stats --max-string 200 --max-array 10 response.json
tsaver mcp --pretty response.json   # indented output for manual inspection
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

Prints an aggregate summary across all history: total entries, per-kind (`run`/`read`/`mcp`) byte counts and reduction %, an **approx. tokens saved** line, and a "Recent entries" list.

- "Tokens saved" is a whitespace-split word-count proxy (`rawWords - filteredWords`), the same approximation `--stats` uses — not an exact tokenizer count.
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

## `tsaver history clear`

```
tsaver history clear [--force]
```

Permanently deletes every history entry under `~/.tsaver/history/`. Nothing else is touched — the cache under `~/.tsaver/cache/` (used by the Claude Code Read hook) and any installed hooks/custom filters are left alone.

- Without `--force`, refuses and prints how many entries would be deleted, so you don't lose history by accident.
- With `--force`, deletes everything and prints a count of entries removed.
- If history is already empty, prints a short confirmation and exits 0 either way.
- After clearing, `tsaver report` and `tsaver dashboard` both reset to their "no history yet" state.

```bash
tsaver history clear          # shows what would be deleted, refuses
tsaver history clear --force  # actually deletes it
```

---

## `tsaver init --claude`

```
tsaver init --claude
```

Installs **two** Claude Code `PreToolUse` hooks:
1. On the `Bash` tool — every Bash command Claude Code runs (terminal or VS Code extension) is automatically rerouted through `tsaver run` before its output reaches Claude's context.
2. On the `Read` tool — every Read of a `.pdf`, `.ipynb`, or image file is automatically redirected through `tsaver read` first, so Claude sees the optimized/extracted content instead of the raw original. No manual prefixing or `tsaver read` calls needed for either case.

### What it does
- Writes `~/.claude/hooks/tsaver-reroute.cjs` (Bash hook) and `~/.claude/hooks/tsaver-read-reroute.cjs` (Read hook), both mode `0o755`.
- Merges two `hooks.PreToolUse` entries into `~/.claude/settings.json` — **merges, never overwrites** existing settings.
- Re-running `tsaver init --claude` always refreshes both hook scripts' content (even if the settings.json entries already exist) — useful if tsaver's own install location has moved.

### Why the hooks embed an absolute path
Both generated hook scripts invoke `tsaver`'s compiled entry point via its **resolved absolute path** (`node '<path to dist/cli.js>' ...`) rather than a bare `tsaver` command. This was a real bug found and fixed in development: Claude Code's hook commands can run in a non-interactive shell context that never sources the shell init files a version manager like `nvm` relies on to put `tsaver` on `PATH`. Relying on `PATH` here caused every single Bash call to silently fail, freezing the session (since even the recovery commands needed that same broken `tsaver`). The absolute-path fix makes both hooks immune to PATH/shell-context issues.

### What the Bash hook does NOT reroute
Commands matching this pattern run **directly, unmodified**, because wrapping them in a subshell would silently break their effect on the rest of the session:
```
cd, pushd, popd, export, source, . (dot), alias, unset, declare, local, readonly, set, exec
```

### How the Read hook works
On every `Read` tool call, the hook checks the file extension against `.pdf`, `.ipynb`, `.png`, `.jpg`/`.jpeg`, `.gif`, `.webp` (case-insensitive). If it matches:
- It skips paths that are already a tsaver cache file or already end in `.optimized.<ext>` — avoids double-processing a file tsaver already optimized.
- Otherwise it runs `tsaver read --cache <path>` synchronously and reads back the single line of output: a redirect path.
  - For **PDFs and notebooks**, that's a cached extracted-text/Markdown file under `~/.tsaver/cache/`.
  - For **images**, that's the actual resized `<name>.optimized.<ext>` image file (not text) — Claude's Read tool needs real image bytes for vision, so the redirect always points at another image, never a text summary.
- Claude's Read is then redirected to that path via `hookSpecificOutput.updatedInput.file_path`.
- If `tsaver read` fails for any reason (corrupt file, unsupported edge case, timeout after 30s), the hook falls through silently and Claude reads the original file unmodified — it never blocks the Read.

### Required manual step
After running `tsaver init --claude`, Claude Code must reload hooks — either open `/hooks` once in the session, or restart Claude Code. This isn't automatic.

### Marking hook-originated entries
Both generated hooks set `TSAVER_HOOK_SOURCE=1` on the `tsaver run`/`tsaver read` invocations they trigger. tsaver reads that env var and records `source: "hook"` on the history entry, which is what lets `report` and the dashboard distinguish "Claude triggered this automatically" from "I ran this myself."

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

**References are ranked by usage before the 50-reference cap is applied.** A substring query can match several distinct symbol names at once (e.g. `Filter` matches `GenericFilter`, `NpmFilter`, `CargoFilter`, ...) — each name's references are sorted by how many distinct files reference it, then by total reference count as a tiebreaker, so a symbol used broadly across the codebase surfaces ahead of one used only in a single place, rather than whichever happened to be scanned first.

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
- Top-of-page stat tiles: total entries, **approx. tokens saved** (highlighted), raw bytes, filtered bytes, overall reduction %. "Tokens saved" is the same whitespace-split word-count proxy used by `--stats` (`rawWords - filteredWords`) — an approximation, not an exact tokenizer count.
- The history table includes a **Tokens saved** column per row, computed the same way per-entry.
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

## How tsaver actually works

This section ties together everything above into one end-to-end picture: what's stored where, how each command parses its input, and what the numbers you see actually mean.

### Everything tsaver stores, and where

All of it lives under your home directory — nothing is sent anywhere, nothing requires a server:

| Path | Written by | Contents |
|---|---|---|
| `~/.tsaver/history/<id>.json` | `run`, `read`, `mcp` (one file per invocation) | Full record of what happened — see [History entry shape](#history-entry-shape) below. |
| `~/.tsaver/cache/<sha1-of-path>.md` | `tsaver read --cache` (used by the Claude Code Read hook) | The extracted text / Markdown for a PDF or notebook, keyed by a SHA-1 hash of the original file's absolute path. Overwritten fresh on every Read — there's no staleness tracking because the hook regenerates it live on every call. |
| `<original-file>.optimized.<ext>` (next to the original file, not under `~/.tsaver/`) | `tsaver read` on an image | The resized image itself. Images are never routed through the text cache above — the Read hook needs real image bytes for Claude's vision, so the redirect always points at this file. |
| `<project>/.tsaver/filters/*.toml` and `~/.tsaver/filters/*.toml` | You, by hand | Custom per-command filter rules — see [Custom filters](#custom-filters). Project-local overrides global for the same command name. |
| `<project>/.tsaver/graph.json` | `tsaver graph build` | The regex-based symbol index for that directory — see [`tsaver graph`](#tsaver-graph). |
| `~/.claude/hooks/tsaver-reroute.cjs` and `~/.claude/hooks/tsaver-read-reroute.cjs` | `tsaver init --claude` | The two generated hook scripts — see [`tsaver init --claude`](#tsaver-init---claude). |

Nothing here is ever deleted automatically. History accumulates indefinitely until you run [`tsaver history clear`](#tsaver-history-clear); the cache directory and `.optimized.<ext>` files are likewise left in place until you remove them by hand.

### History entry shape

Every `run`, `read`, and `mcp` invocation writes one JSON file to `~/.tsaver/history/<id>.json` (a 10-character hex id):

```ts
{
  id: string;
  timestamp: string;          // ISO 8601
  kind: "run" | "read" | "mcp";
  label: string;               // command/file, truncated to one line + "...(+N more lines)" if long/multi-line
  exitCode?: number | null;    // run only — the wrapped command's exit code
  filterName?: string;         // run only — which filter handled it: "generic" | "pytest" | "npm" | "cargo" | "go" | "git" | "custom:<name>"
  source?: "hook" | "manual";  // run and read — "hook" if a Claude Code PreToolUse hook triggered it, "manual" if you ran the tsaver command yourself
  stats: {
    rawLines, filteredLines, rawBytes, filteredBytes, rawWords, filteredWords: number;
  };
  rawText?: string;   // run/mcp — full original content, recoverable via `retrieve`
  rawPath?: string;   // read — original file's absolute path, re-read by `retrieve` rather than duplicating its bytes into this JSON file
  filteredText: string;
}
```

### How each command actually parses/processes its input

- **`run`**: spawns the wrapped command with `child_process.spawn`, reads its stdout/stderr **line by line** via Node's `readline` (so large output never has to sit fully in memory before filtering). Each line is handed to the active filter's `processLine`, which decides per line to keep it, drop it, or buffer it for possible repeat-collapsing. See [Filter selection order](#tsaver-run) for which filter runs.
- **`read`**: dispatches purely by file **extension** (not content sniffing) — `.pdf` → `pdf-parse` extracts embedded text objects from the PDF structure; `.ipynb` → the file is parsed as JSON (it's just a JSON document) and walked cell-by-cell; images → decoded and resized by `jimp`; anything else is read as plain UTF-8 text and passed through unchanged.
- **`mcp`**: parses the input with `JSON.parse` up front — if that fails, it reports the parse error and exits without writing anything. The compaction walk (`compactJson`) then recurses through the parsed value, truncating long strings and arrays as it goes, and re-serializes with `JSON.stringify` at the end, which is what guarantees the output is always valid JSON.
- **`graph build`**: walks the directory tree with `readdirSync`/`statSync` (skipping `node_modules`, `.git`, `dist`, `build`, `out`, `.tsaver`, `coverage`, and hidden directories), reads each matching file as UTF-8 text, and runs it line-by-line through a fixed set of regular expressions per language — it never builds an actual syntax tree. See [`tsaver graph`](#tsaver-graph) for exactly which patterns.

### What the byte and "tokens saved" numbers actually mean — and a real caveat

Every entry tracks **two independent before/after measurements**: bytes and "words" (a whitespace-split word count used as an approximate token proxy, not an exact tokenizer count — labeled as such everywhere it's shown).

For `run` and `mcp`, raw and filtered are both genuinely comparable plain text (the same command's output, before and after filtering), so both the byte reduction and the tokens-saved number are real and meaningful. A representative real test run through `tsaver run` on a script producing 50 repetitive pass lines plus a real error: **52 → 8 lines, 1,425 → 247 bytes (82.7% reduction), 163 → 32 words (80.4% reduction, ~131 tokens saved)** — the repeated lines collapsed to one `(×45)` line while the error and summary were kept intact.

**For PDF and notebook reads, the word-count metric is not meaningful and will usually show 0 "tokens saved" even though the real savings are large.** This isn't a bug so much as a measurement gap: there is no plain-text "raw" version of a binary PDF to count words in before extraction happens, so `tsaver read` sets the raw word count equal to the already-extracted text's word count — the two numbers are always identical for these file kinds. The **byte** reduction is still real and large (a 2 MB PDF reduced to a few KB of extracted text is a genuine ~2 MB reduction in what would otherwise need to reach the agent in some form), but don't read "0 tokens saved" on a PDF/notebook entry as "this did nothing" — check the byte numbers instead, which reflect the actual outcome.

---

## Troubleshooting

### `npm install -g github:asad-u14/tsaver` fails with a TLS/certificate error or extraction errors
On networks with a TLS-intercepting proxy (common on some corporate networks), npm's git-dependency fetch can fail outright. **Use clone + `npm link` instead** (see [Install](#install)) — a plain `git clone` over HTTPS is less likely to hit that than npm's internal git-install path.

### `tsaver: command not found` after installing, or it suddenly stops working
Usually one of:
- **A stale/dangling global symlink.** If a previous `npm install -g github:...` attempt partially succeeded, `node_modules/tsaver` in your global npm folder may point at a now-deleted npm temp-cache directory. Fix: `npm uninstall -g tsaver`, remove any leftover dangling symlink at `$(dirname "$(which node)")/tsaver`, then reinstall via clone + `npm link`.
- **Lost executable bit.** If `dist/cli.js` lost its `+x` permission (can happen after certain `npm install`/git operations), running `tsaver` fails with "permission denied." Fix: `chmod +x dist/cli.js` in your clone (or just re-run `npm run build`, which regenerates it, followed by `chmod +x dist/cli.js` if needed).
- **Local changes blocking `git pull`.** If `dist/cli.js` or `package-lock.json` have uncommitted local changes (e.g. from a permission-bit fix), `git pull` will refuse to merge. Fix: `git checkout -- dist/cli.js package-lock.json` (safe — both are regenerated by `npm install`/`npm run build`) then pull again.

### `git pull`/`git fetch` times out over SSH (`ssh: connect to host github.com port 22: Operation timed out`)
Some corporate networks block outbound SSH (port 22) entirely. Fetch over HTTPS instead for one-off access without changing your configured remote:
```bash
git pull https://github.com/asad-u14/tsaver.git main
```

### The Claude Code hook (`tsaver init --claude`) doesn't seem to be filtering anything
Claude Code only reloads hook configuration at session start or when you open `/hooks` — editing `~/.claude/settings.json` (including via `tsaver init --claude`) has no effect on an already-running session until one of those happens.
