#!/bin/bash
# Runs every benchmark scenario through tsaver's own CLI and captures its
# self-reported --stats numbers. This is the "cross-check" layer in the
# test plan — a way to sanity-check the portal numbers against tsaver's
# own math, not a replacement for them. These numbers never touch a real
# agent session, so they're free to re-run as many times as you like.
set -euo pipefail
cd "$(dirname "$0")/.."

TSAVER="node dist/cli.js"
FIXTURES="benchmarks/fixtures"
OUT="benchmarks/results-tsaver-side.txt"

echo "tsaver-side benchmark run — $(date)" > "$OUT"
echo "(cross-check only — see benchmarks/PLAN.md for the real test, which needs portal numbers)" >> "$OUT"
echo "" >> "$OUT"

run_scenario() {
  local label="$1"
  shift
  echo "=== $label ===" >> "$OUT"
  # Capture --stats (stderr) only; discard the actual filtered stdout.
  { "$@" > /dev/null; } 2>> "$OUT" || true
  echo "" >> "$OUT"
}

echo "Building tsaver..."
npm run build --silent

echo "Running scenarios..."

run_scenario "1. Noisy test run (tsaver run)" \
  $TSAVER run --stats -- "$FIXTURES/noisy-tests.sh"

run_scenario "2. Noisy build (tsaver run)" \
  $TSAVER run --stats -- "$FIXTURES/noisy-build.sh"

run_scenario "3. MCP array-shaped JSON (tsaver mcp)" \
  bash -c "$TSAVER mcp --stats '$FIXTURES/mcp-array.json'"

run_scenario "4. MCP object-shaped JSON (tsaver mcp)" \
  bash -c "$TSAVER mcp --stats '$FIXTURES/mcp-object.json'"

if [ -f report.pdf ]; then
  run_scenario "5. Real PDF read (tsaver read)" \
    $TSAVER read --stats report.pdf
else
  echo "=== 5. Real PDF read (tsaver read) ===" >> "$OUT"
  echo "SKIPPED — no report.pdf found in repo root" >> "$OUT"
  echo "" >> "$OUT"
fi

echo ""
echo "Done. Results written to $OUT"
echo ""
cat "$OUT"
