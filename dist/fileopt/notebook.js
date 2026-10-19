import { readFileSync } from "node:fs";
const MAX_OUTPUT_LINES = 20;
function joinSource(source) {
    return Array.isArray(source) ? source.join("") : source;
}
function truncateOutput(text) {
    const lines = text.split("\n");
    if (lines.length <= MAX_OUTPUT_LINES)
        return text;
    const kept = lines.slice(0, MAX_OUTPUT_LINES);
    return `${kept.join("\n")}\n(truncated, ${lines.length - MAX_OUTPUT_LINES} more lines)`;
}
export function notebookToMarkdown(path) {
    const notebook = JSON.parse(readFileSync(path, "utf8"));
    const lang = notebook.metadata?.kernelspec?.language ?? "";
    const parts = [];
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
                .filter((t) => !!t);
            for (const text of outputTexts) {
                parts.push(`\`\`\`\n${truncateOutput(text)}\n\`\`\``);
            }
            continue;
        }
        parts.push(source);
    }
    return parts.join("\n\n");
}
