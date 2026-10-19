import { exec } from "node:child_process";
import { startServer } from "../dashboard/server.js";
const DEFAULT_PORT = 4173;
function openBrowser(url) {
    const platform = process.platform;
    const cmd = platform === "darwin" ? `open ${url}` : platform === "win32" ? `start ${url}` : `xdg-open ${url}`;
    exec(cmd, () => {
        // Best-effort — if no browser opener is available, the user still has the printed URL.
    });
}
export async function dashboard(args) {
    let port = DEFAULT_PORT;
    const portIdx = args.indexOf("--port");
    if (portIdx !== -1 && args[portIdx + 1]) {
        port = Number(args[portIdx + 1]);
    }
    return new Promise((resolve) => {
        const server = startServer(port);
        server.on("listening", () => {
            const url = `http://127.0.0.1:${port}`;
            process.stdout.write(`tsaver dashboard running at ${url} (local only — press Ctrl+C to stop)\n`);
            openBrowser(url);
        });
        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                process.stderr.write(`Port ${port} is already in use. Try --port <other>.\n`);
            }
            else {
                process.stderr.write(`Dashboard server error: ${err.message}\n`);
            }
            resolve(1);
        });
        process.on("SIGINT", () => {
            server.close(() => resolve(0));
        });
    });
}
