import { readFileSync } from "node:fs";
import { extname } from "node:path";
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
export function detectKind(path) {
    const ext = extname(path).toLowerCase();
    if (ext === ".pdf")
        return "pdf";
    if (ext === ".ipynb")
        return "notebook";
    if (IMAGE_EXTS.has(ext))
        return "image";
    return "text";
}
export function readAsText(path) {
    return readFileSync(path, "utf8");
}
