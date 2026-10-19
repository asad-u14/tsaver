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

export function notebookToMarkdown(path: string): string {
  const notebook: Notebook = JSON.parse(readFileSync(path, "utf8"));
  const lang = notebook.metadata?.kernelspec?.language ?? "";
  const parts: string[] = [];

  for (const cell of notebook.cells) {
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

  return parts.join("\n\n");
}
