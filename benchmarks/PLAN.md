# Real performance test plan: tsaver vs. no tsaver, measured on the usage portal

This measures what actually matters — tokens billed on your account — for
the same real agent work, once with tsaver active and once without.
tsaver's own `--stats` numbers (see `run-tsaver-side.sh`) are a useful
cross-check but are self-reported; the portal numbers below are ground
truth.

## Why this needs to be manual

The portal shows token usage per session/day, tied to your account. There's
no API this harness can call to pull that back automatically — you read it
off the dashboard after each run and fill it into the results table below.
Everything else (generating fixtures, running the scenarios, computing
tsaver's own stats) is automated by this harness.

## Setup (one time)

1. Make sure the benchmark fixtures exist and are current:
   ```bash
   node benchmarks/fixtures/generate-mcp-fixtures.mjs
   ```
2. Decide where the "without tsaver" runs happen. Easiest: a second
   directory/project where `tsaver init --claude`'s hook is **not**
   installed, or temporarily remove the `PreToolUse` hook entries from
   `~/.claude/settings.json` for the "without" runs and restore them for
   the "with" runs. (`tsaver init --claude` re-adds them; there's no
   `tsaver init --claude --undo` yet — removing the two `PreToolUse`
   entries by hand in settings.json is the current way to disable it.)
3. Have the fixture files available in both environments: copy
   `benchmarks/fixtures/` into whichever directory the "without" runs use,
   or just `cd` into this repo for both and toggle the hook in between.

## The 5 scenarios

| # | Scenario | Fixture | Exercises |
|---|---|---|---|
| 1 | Noisy test run | `benchmarks/fixtures/noisy-tests.sh` | `tsaver run` / pytest-shaped filter path |
| 2 | Noisy build | `benchmarks/fixtures/noisy-build.sh` | `tsaver run` / generic filter progress-line collapsing |
| 3 | MCP array-shaped JSON | `benchmarks/fixtures/mcp-array.json` | `tsaver mcp` / array truncation |
| 4 | MCP object-shaped JSON | `benchmarks/fixtures/mcp-object.json` | `tsaver mcp` / object-key truncation (the one that used to regress) |
| 5 | Real PDF read | `report.pdf` (repo root) | `tsaver read` / PDF text extraction |

Each scenario has a **fixed prompt** (below) — use the exact same wording
for both the "with" and "without" run of that scenario, so the only
variable is whether tsaver is in the loop.

## Procedure, per scenario

Repeat this block 5 times (once per scenario), running **"without" first,
then "with"**, each in its own fresh session:

1. **Start a brand-new Claude Code session.** Don't reuse a session across
   scenarios or across with/without — prompt caching from an earlier turn
   would make a later run artificially cheap, independent of tsaver.
2. Give the exact prompt for this scenario (see table below).
3. Let it finish. Do not continue the conversation afterward.
4. Open the usage portal. Record that session's **input tokens**, **output
   tokens**, and **total** in the results template.
5. Note whether the agent's answer/action was actually correct (did it
   correctly report the failure, the warning, the summary, etc.) — a token
   saving on a wrong answer isn't a saving, it's a regression hidden behind
   a smaller number.
6. Repeat steps 1-5 with tsaver active for the same scenario.

### Prompts to use verbatim

1. **Noisy test run**: `Run benchmarks/fixtures/noisy-tests.sh and tell me what failed.`
2. **Noisy build**: `Run benchmarks/fixtures/noisy-build.sh and tell me if the build succeeded and whether there were any warnings.`
3. **MCP array JSON**: `Read benchmarks/fixtures/mcp-array.json and tell me how many results it contains and give me one example entry.`
4. **MCP object JSON**: `Read benchmarks/fixtures/mcp-object.json and tell me the package name and how many versions are listed.`
5. **PDF read**: `Read report.pdf and summarize its main sections.`

For scenarios 3/4, "without tsaver" means Claude Code reads the raw JSON
file directly (a normal `Read` tool call) — there's no MCP server needed
for this test, the fixture file itself stands in for an MCP tool's
response. For scenario 5, "without tsaver" means the Read hook is off, so
Claude Code gets the raw PDF bytes instead of the tsaver-extracted text.

## Results template

Copy this table and fill in the portal numbers as you go. `tsaver-reduction%`
is tsaver's own claimed reduction for that scenario (from
`benchmarks/results-tsaver-side.txt`, already generated) — fill it in once
for reference, it doesn't change per run.

```
| # | Scenario            | Without: input | Without: output | Without: total | With: input | With: output | With: total | Actual % saved | tsaver's own % | Both correct? |
|---|----------------------|-----------------|------------------|-----------------|-------------|---------------|-------------|-----------------|------------------|----------------|
| 1 | Noisy test run       |                 |                  |                 |             |               |             |                 | 65.5% bytes      |                |
| 2 | Noisy build          |                 |                  |                 |             |               |             |                 | 92.5% bytes      |                |
| 3 | MCP array JSON       |                 |                  |                 |             |               |             |                 | 97.5% bytes      |                |
| 4 | MCP object JSON      |                 |                  |                 |             |               |             |                 | 97.8% bytes      |                |
| 5 | Real PDF read        |                 |                  |                 |             |               |             |                 | 99.9% bytes      |                |
```

`Actual % saved` = `(Without:total - With:total) / Without:total * 100`.

## Reading the results honestly

- **If the portal numbers roughly track tsaver's own claims**, that's real
  validation — the self-reported stats aren't just marketing.
- **If a scenario shows much smaller savings on the portal than tsaver
  claims**, the likely cause is the agent did extra work either way (asked
  follow-up questions, re-read the file) that swamps the filtering
  difference — note what actually happened in the session, not just the
  number.
- **If "Both correct?" is No for the "with tsaver" run**, that's the most
  important finding of the whole test and overrides any token savings
  number — file it as a real bug, not an acceptable tradeoff.
- Run each scenario more than once if you have the budget for it — a
  single run of either condition is one data point, not a measurement.

## Files in this directory

- `fixtures/` — the real, committed benchmark scripts/data (no live network
  calls needed, so these are exactly reproducible)
- `run-tsaver-side.sh` — runs every scenario through tsaver's own CLI,
  writes `results-tsaver-side.txt`. Cross-check only, not a substitute for
  the portal numbers above.
- `results-tsaver-side.txt` — generated output of the above, already run
  once as a baseline.
