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
function cellMatches(cell, query) {
    const lowerQuery = query.toLowerCase();
    const source = joinSource(cell.source);
    if (source.toLowerCase().includes(lowerQuery))
        return true;
    return (cell.outputs ?? []).some((o) => o.text && joinSource(o.text).toLowerCase().includes(lowerQuery));
}
export function notebookToMarkdown(path, query) {
    const notebook = JSON.parse(readFileSync(path, "utf8"));
    const lang = notebook.metadata?.kernelspec?.language ?? "";
    const parts = [];
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
                .filter((t) => !!t);
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
