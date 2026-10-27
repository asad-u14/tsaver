import { readFileSync } from "node:fs";
import { PDFParse } from "pdf-parse";

/** 1-indexed, inclusive page range, e.g. { first: 1, last: 5 }. */
export interface PageRange {
  first: number;
  last: number;
}

export async function pdfToText(path: string, pages?: PageRange): Promise<string> {
  const data = readFileSync(path);
  const parser = new PDFParse({ data });
  try {
    if (pages) {
      // pdf-parse's `partial` option takes an explicit list of 1-indexed
      // page numbers rather than a range, so the range is expanded here —
      // this is what lets `tsaver read --pages N-M` extract only the pages
      // an agent actually needs instead of always parsing the whole
      // document.
      const pageList: number[] = [];
      for (let p = pages.first; p <= pages.last; p++) pageList.push(p);
      const result = await parser.getText({ partial: pageList });
      return result.text;
    }
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
