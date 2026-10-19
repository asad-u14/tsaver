import { readFileSync } from "node:fs";
import { PDFParse } from "pdf-parse";
export async function pdfToText(path) {
    const data = readFileSync(path);
    const parser = new PDFParse({ data });
    try {
        const result = await parser.getText();
        return result.text;
    }
    finally {
        await parser.destroy();
    }
}
