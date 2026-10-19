import { readFileSync } from "node:fs";
import { loadEntry } from "../history.js";
export async function retrieve(args) {
    const id = args[0];
    if (!id) {
        process.stderr.write("Usage: tsaver retrieve <id>\n");
        return 1;
    }
    const entry = loadEntry(id);
    if (!entry) {
        process.stderr.write(`tsaver retrieve: no history entry found for id "${id}"\n`);
        return 1;
    }
    if (entry.rawText !== undefined) {
        process.stdout.write(entry.rawText + "\n");
        return 0;
    }
    if (entry.rawPath) {
        try {
            process.stdout.write(readFileSync(entry.rawPath));
            return 0;
        }
        catch (err) {
            process.stderr.write(`tsaver retrieve: original file no longer readable: ${err.message}\n`);
            return 1;
        }
    }
    process.stderr.write("tsaver retrieve: entry has no recoverable original content\n");
    return 1;
}
