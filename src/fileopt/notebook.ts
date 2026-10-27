import { readFileSync } from "node:fs";

const MAX_OUTPUT_LINES = 20;

interface NotebookCell {
  cell_type: "code" | "markdown" | "raw";
  source: string | string[];
  outputs?: Array<{
    text?: string | string[];
    data?: Record<string, unknown>;
  }>;
}

interface Notebook {
  cells: NotebookCell[];
  metadata?: { kernelspec?: { language?: string } };
}

function joinSource(source: string | string[]): string {
  return Array.isArray(source) ? source.join("") : source;
}

function truncateOutput(text: string): string {
  const lines = text.split("\n");
  if (lines.length <= MAX_OUTPUT_LINES) return text;
  const kept = lines.slice(0, MAX_OUTPUT_LINES);
  return `${kept.join("\n")}\n(truncated, ${lines.length - MAX_OUTPUT_LINES} more lines)`;
}

function cellMatches(cell: NotebookCell, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const source = joinSource(cell.source);
  if (source.toLowerCase().includes(lowerQuery)) return true;
  return (cell.outputs ?? []).some(
    (o) => o.text && joinSource(o.text).toLowerCase().includes(lowerQuery),
  );
}

export function notebookToMarkdown(path: string, query?: string): string {
  const notebook: Notebook = JSON.parse(readFileSync(path, "utf8"));
  const lang = notebook.metadata?.kernelspec?.language ?? "";
  const parts: string[] = [];
  let skippedCells = 0;

  for (const cell of notebook.cells) {
    if (query && !cellMatches(cell, query)) {
      skippedCells++;
      continue;
    }

    const source = joinSource(cell.source).trimEnd();
    if (cell.cell_type === "markdown") {
      parts.push(source);
      continue;
    }
    if (cell.cell_type === "code") {
      parts.push(`\`\`\`${lang}\n${source}\n\`\`\``);
      const outputTexts = (cell.outputs ?? [])
        .map((o) => (o.text ? joinSource(o.text).trimEnd() : null))
        .filter((t): t is string => !!t);
      for (const text of outputTexts) {
        parts.push(`\`\`\`\n${truncateOutput(text)}\n\`\`\``);
      }
      continue;
    }
    parts.push(source);
  }

  if (query && skippedCells > 0) {
    parts.push(`(${skippedCells} cell${skippedCells === 1 ? "" : "s"} not matching "${query}" omitted)`);
  }

  return parts.join("\n\n");
}
