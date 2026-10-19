import { readFileSync } from "node:fs";
import { extname } from "node:path";

export type FileKind = "pdf" | "notebook" | "image" | "text";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export function detectKind(path: string): FileKind {
  const ext = extname(path).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".ipynb") return "notebook";
  if (IMAGE_EXTS.has(ext)) return "image";
  return "text";
}

export function readAsText(path: string): string {
  return readFileSync(path, "utf8");
}
