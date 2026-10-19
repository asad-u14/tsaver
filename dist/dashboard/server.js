import { createServer } from "node:http";
import { URL } from "node:url";
import { listEntries, summarizeHistory } from "../history.js";
import { renderPage } from "./page.js";
export function startServer(port) {
    const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(renderPage());
            return;
        }
        if (url.pathname === "/api/summary") {
            const entries = listEntries();
            const summary = summarizeHistory(entries);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(summary));
            return;
        }
        if (url.pathname === "/api/history") {
            const limitParam = url.searchParams.get("limit");
            const limit = limitParam ? Number(limitParam) : undefined;
            const entries = listEntries();
            const sliced = limit && limit > 0 ? entries.slice(-limit) : entries;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(sliced));
            return;
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    });
    server.listen(port, "127.0.0.1");
    return server;
}
