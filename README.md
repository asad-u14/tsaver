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

`npm link` makes the `tsaver` command available globally. To install directly from GitLab instead of cloning:

```bash
npm install -g git+ssh://git@gitlab.com/ai-projects-14/tsaver.git
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

## What's out of scope

This is a local-only subset of the full [JFrog Boost](https://github.com/jfrog/boost) feature set. Deliberately not included:
- Code graph / repo-wide symbol indexing (BoostGraph)
- OpenTelemetry export / cloud dashboards
- Editor integrations beyond the Claude Code hook above

## License

ISC
