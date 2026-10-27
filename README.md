# tsaver

A local, Boost-inspired token/output saver for AI coding agents. Wraps noisy CLI commands, compacts large MCP/JSON responses, optimizes files for agent consumption (PDFs, notebooks, images), builds a lightweight code index, and ships a local dashboard — all with local history so original content is always recoverable.

Everything runs on-disk. No telemetry, no network calls, nothing leaves your machine.

## Install

```bash
git clone https://github.com/asad-u14/tsaver.git
cd tsaver
npm install
npm run build
npm link
```

`npm link` makes the `tsaver` command available globally.

You can also install directly from GitHub without a separate clone step:
```bash
npm install -g github:asad-u14/tsaver
```

If a previous install attempt left you with a dangling `tsaver` command, clean it up first:

```bash
npm uninstall -g tsaver
rm -f "$(dirname "$(which node)")/tsaver"   # removes a leftover dangling symlink, if any
```

## Commands

- `tsaver run` — wrap any shell command, filter noisy output
- `tsaver read` — optimize a PDF/notebook/image for an agent to read
- `tsaver mcp` — compact a large JSON blob (e.g. an MCP tool response)
- `tsaver filters gaps` — find commands that need a custom filter
- `tsaver report` — aggregate savings summary
- `tsaver retrieve <id>` — recover original unfiltered content
- `tsaver history clear [--force]` — permanently delete all history
- `tsaver init --claude` — auto-filter every Bash command and optimize every PDF/notebook/image Read Claude Code does
- `tsaver graph build` / `tsaver graph query` — lightweight code symbol index
- `tsaver dashboard` — local web UI over your history

**Full reference, every flag and default, troubleshooting**: see [`docs/USAGE.md`](docs/USAGE.md) or open [`docs/index.html`](docs/index.html) in a browser.

**Does it actually save tokens?** See [`docs/token-savings-report.html`](docs/token-savings-report.html) — six real, reproducible benchmarks with exact before/after numbers. See also [`docs/improvement-plan.html`](docs/improvement-plan.html) for what's been fixed since and what's still planned.

**Want to measure it yourself, against real billed usage?** See [`benchmarks/PLAN.md`](benchmarks/PLAN.md) — a step-by-step plan (plus a harness script) for comparing with-tsaver vs. without-tsaver token usage on your own account's usage portal, not just tsaver's self-reported stats.

## License

ISC
