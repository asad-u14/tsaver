# tsaver

A local, Boost-inspired token/output saver for AI coding agents. Wraps noisy CLI commands, compacts large MCP/JSON responses, optimizes files for agent consumption (PDFs, notebooks, images), and keeps a local history so the original content is always recoverable.

Everything runs on-disk. No telemetry, no network calls, nothing leaves your machine.

## Install

```bash
git clone git@gitlab.com:ai-projects-14/tsaver.git
cd tsaver
npm install
npm run build
npm link
```

`npm link` makes the `tsaver` command available globally.

> **Note:** `npm install -g git+ssh://git@gitlab.com/...` does *not* work reliably for this repo — npm's git installer fetches GitLab packages via the `repository/archive.tar.gz` REST API rather than a real `git clone`, and that endpoint can 404 depending on your network/GitLab setup (observed on a corporate network with TLS interception). Clone + `npm link` above avoids that path entirely and is the supported install method.

If you already ran the broken one-liner and ended up with a dangling `tsaver` command, clean it up first:

```bash
npm uninstall -g tsaver
rm -f "$(dirname "$(which node)")/tsaver"   # removes a leftover dangling symlink, if any
```

## Commands

### `tsaver run`
Wrap any shell command. Filters repetitive/noisy output while always keeping errors, failures, and head/tail context.

```bash
tsaver run --stats -- npm install
tsaver run --stats -- pytest
```

`--stats` prints a before/after line/byte/word summary to stderr.

### `tsaver read`
Optimize a file for agent consumption:
- `.pdf` → extracted plain text
- `.ipynb` → trimmed Markdown (long cell outputs truncated)
- images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`) → resized `<name>.optimized.<ext>` written alongside the original
- anything else → passthrough

```bash
tsaver read --stats report.pdf
tsaver read notebook.ipynb
tsaver read screenshot.png
```

### `tsaver mcp`
Compact a large JSON blob (e.g. an MCP tool response) — truncates long strings and arrays while keeping the output valid JSON.

```bash
curl -s https://api.example.com/big-response.json | tsaver mcp --stats
tsaver mcp --stats --max-string 500 --max-array 20 response.json
```

### `tsaver filters gaps`
Ranks commands that are still falling back to the generic filter (no custom profile), based on history, so you know where a custom `.toml` filter would help most.

```bash
tsaver filters gaps
```

### `tsaver report`
Aggregate savings across everything you've run through tsaver.

```bash
tsaver report
```

### `tsaver retrieve <id>`
Recover the original, unfiltered content for any past `run`/`read`/`mcp` entry by its id (shown in `tsaver report`).

```bash
tsaver retrieve a1b2c3d4e5
```

### `tsaver init --claude`
Installs a Claude Code `PreToolUse` hook on the Bash tool so every Bash command Claude runs is automatically filtered through `tsaver run` — no need to prefix commands manually.

```bash
tsaver init --claude
```

This merges into your existing `~/.claude/settings.json` (never overwrites it) and writes `~/.claude/hooks/tsaver-reroute.cjs`. Commands that affect shell state (`cd`, `export`, `source`, etc.) are left untouched so they still work normally. After installing, open `/hooks` once in Claude Code or restart it to pick up the change.

## Custom filters

Drop a `.toml` file in `.tsaver/filters/` (project-local) or `~/.tsaver/filters/` (global) to define keep/drop regex rules for a specific command:

```toml
# .tsaver/filters/mytool.toml
command = "mytool"
keep = ["^ERROR", "^FAIL"]
drop = ["^progress"]
```

Project-local filters override global ones for the same command. Anything not matched by `keep` or `drop` is passed through the generic repeat-collapsing filter.

### `tsaver graph build` / `tsaver graph query`
Builds a lightweight, regex-based symbol index for a directory (JS/TS/Python), so an agent can look up a symbol's definition, references, and importers instead of grepping the whole repo.

```bash
tsaver graph build [--dir <path>]
tsaver graph query <symbol> [--dir <path>]
```

This is a **heuristic text-pattern index, not an AST** — it does not parse scopes, types, or shadowing. Expect occasional false positives (a common name matching unrelated code) and false negatives (unusual syntax it doesn't recognize). It's meant to be faster and more targeted than grep, not a substitute for a real language server. The index is written to `.tsaver/graph.json` in the target directory; re-run `build` after significant changes to refresh it.

### `tsaver dashboard`
Starts a local web dashboard showing history and savings stats — the same data `tsaver report` prints, in a browser.

```bash
tsaver dashboard [--port 4173]
```

Binds to `127.0.0.1` only — nothing is exposed on the network, and no data leaves your machine. Opens your default browser automatically; stop it with Ctrl+C.

## What's out of scope

Deliberately not included:
- OpenTelemetry export / cloud dashboards — the dashboard above is local-only, no telemetry is sent anywhere
- Editor integrations beyond the Claude Code hook above (e.g. Cursor, Codex CLI, Copilot CLI) — their hook/config formats weren't verified, so nothing was built against guessed formats

## License

ISC
