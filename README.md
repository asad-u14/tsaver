# tsaver

A local, Boost-inspired token/output saver for AI coding agents. Wraps noisy CLI commands, compacts large MCP/JSON responses, optimizes files for agent consumption (PDFs, notebooks, images), builds a lightweight code index, and ships a local dashboard — all with local history so original content is always recoverable.

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

## License

ISC
