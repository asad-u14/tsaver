export function renderPage() {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>tsaver dashboard</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; background: #0b0d12; color: #e4e7eb; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 16px; }
  .tiles { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
  .tile { background: #15181f; border: 1px solid #262b35; border-radius: 8px; padding: 14px 18px; min-width: 140px; }
  .tile .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #8b93a3; margin-bottom: 6px; }
  .tile .value { font-size: 22px; font-weight: 600; }
  .tile .value .sub-mb { font-size: 10px; font-weight: 400; color: #8b93a3; margin-left: 5px; }
  .tile.tile-highlight { border-color: #2f7a5f; background: #122019; }
  .tile.tile-highlight .value { color: #6ee7b7; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #1f232c; }
  th { color: #8b93a3; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  td.mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  .kind-run { color: #6ee7b7; }
  .kind-read { color: #93c5fd; }
  .kind-mcp { color: #fca5a5; }
  .empty { color: #8b93a3; padding: 20px 0; }
</style>
</head>
<body>
  <h1>TSaver Dashboard</h1>
  <div class="tiles" id="tiles"></div>
  <table id="table">
    <thead><tr><th>Time</th><th>Kind</th><th>Label</th><th>Raw → Filtered (bytes)</th><th>Reduction</th><th>Tokens used</th><th>Tokens saved</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <div id="empty" class="empty" style="display:none">No history yet. Run \`tsaver run\`, \`tsaver read\`, or \`tsaver mcp\` to populate this.</div>
<script>
async function load() {
  const [summaryRes, historyRes] = await Promise.all([
    fetch('/api/summary'),
    fetch('/api/history?limit=100'),
  ]);
  const summary = await summaryRes.json();
  const history = await historyRes.json();

  const tiles = document.getElementById('tiles');
  tiles.innerHTML = '';
  const tileData = [
    ['Total tokens', summary.rawWords.toLocaleString()],
    ['Used tokens', summary.filteredWords.toLocaleString()],
    ['Approx. tokens saved', summary.wordsSaved.toLocaleString(), 'tile-highlight'],
    ['Total entries', summary.totalEntries.toLocaleString()],
    ['Raw bytes', summary.rawBytes.toLocaleString(), '', summary.rawBytes],
    ['Filtered bytes', summary.filteredBytes.toLocaleString(), '', summary.filteredBytes],
    ['Reduction', summary.reductionPct.toFixed(1) + '%'],
  ];
  for (const [label, value, extraClass, bytesForMb] of tileData) {
    const el = document.createElement('div');
    el.className = 'tile' + (extraClass ? ' ' + extraClass : '');
    const mbSuffix = bytesForMb !== undefined ? '<span class="sub-mb">(' + toMb(bytesForMb) + ' MB)</span>' : '';
    el.innerHTML = '<div class="label">' + label + '</div><div class="value">' + value + mbSuffix + '</div>';
    tiles.appendChild(el);
  }

  const rows = document.getElementById('rows');
  const emptyEl = document.getElementById('empty');
  const tableEl = document.getElementById('table');
  rows.innerHTML = '';

  if (history.length === 0) {
    tableEl.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  tableEl.style.display = '';
  emptyEl.style.display = 'none';

  for (const entry of history.slice().reverse()) {
    const tr = document.createElement('tr');
    const pct = entry.stats.rawBytes === 0 ? 0 : (1 - entry.stats.filteredBytes / entry.stats.rawBytes) * 100;
    const tokensUsed = entry.stats.filteredWords;
    const tokensSaved = entry.stats.rawWords - entry.stats.filteredWords;
    tr.innerHTML =
      '<td class="mono">' + new Date(entry.timestamp).toLocaleString() + '</td>' +
      '<td class="kind-' + entry.kind + '">' + entry.kind + '</td>' +
      '<td class="mono">' + escapeHtml(entry.label) + '</td>' +
      '<td class="mono">' + entry.stats.rawBytes + ' → ' + entry.stats.filteredBytes + '</td>' +
      '<td>' + pct.toFixed(1) + '%</td>' +
      '<td class="mono">' + tokensUsed.toLocaleString() + '</td>' +
      '<td class="mono">' + tokensSaved.toLocaleString() + '</td>';
    rows.appendChild(tr);
  }
}

function toMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

load();
setInterval(load, 5000);
</script>
</body>
</html>
`;
}
