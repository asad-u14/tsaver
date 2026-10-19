import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse as parseToml } from "smol-toml";
function readTomlDir(dir) {
    const configs = new Map();
    let files;
    try {
        files = readdirSync(dir).filter((f) => f.endsWith(".toml"));
    }
    catch {
        return configs;
    }
    for (const file of files) {
        try {
            const raw = parseToml(readFileSync(join(dir, file), "utf8"));
            if (raw.command)
                configs.set(raw.command, raw);
        }
        catch {
            // Ignore malformed filter files rather than crashing the whole run.
        }
    }
    return configs;
}
/** Project-local .tsaver/filters/*.toml override global ~/.tsaver/filters/*.toml for the same command. */
export function loadCustomFilterConfigs() {
    const global = readTomlDir(join(homedir(), ".tsaver", "filters"));
    const project = readTomlDir(join(process.cwd(), ".tsaver", "filters"));
    for (const [command, config] of project) {
        global.set(command, config);
    }
    return global;
}
