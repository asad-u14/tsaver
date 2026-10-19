import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function buildHookScript(tsaverBinPath) {
    // The resolved absolute path to tsaver's entry point is embedded directly
    // (not invoked as a bare `tsaver`) so the hook works regardless of PATH —
    // Claude Code's hook commands may run in a non-interactive shell that
    // never sources the shell init files a tool like nvm relies on.
    const escapedBinPath = tsaverBinPath.replace(/"/g, '\\"');
    return `#!/usr/bin/env node
// Installed by \`tsaver init --claude\` — reroutes Bash tool calls through
// \`tsaver run\` so their output is filtered before it reaches Claude's context.
const TSAVER_BIN = ${JSON.stringify(escapedBinPath)};

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const command = input?.tool_input?.command;
  if (typeof command !== "string" || command.trim() === "") {
    process.exit(0);
  }

  const trimmed = command.trim();

  // Already routed through tsaver — avoid double-wrapping / recursion.
  if (trimmed.includes("tsaver") && /\\brun\\b/.test(trimmed) && trimmed.includes(TSAVER_BIN)) {
    process.exit(0);
  }

  // Commands that affect persistent shell state (cwd, env, aliases) must run
  // directly — a subshell wrapper would silently swallow their effect on
  // later Bash calls.
  const STATEFUL_RE =
    /(^|[;&|]\\s*)(cd|pushd|popd|export|source|\\.\\s|alias|unset|declare|local|readonly|set|exec)\\b/;
  if (STATEFUL_RE.test(trimmed)) {
    process.exit(0);
  }

  const escaped = trimmed.replace(/'/g, "'\\\\''");
  const quotedBin = TSAVER_BIN.replace(/'/g, "'\\\\''");
  const newCommand = \`TSAVER_HOOK_SOURCE=1 node '\${quotedBin}' run -- bash -c '\${escaped}'\`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { ...input.tool_input, command: newCommand },
      },
    }),
  );
  process.exit(0);
});
`;
}
const HOOK_COMMAND = "node ~/.claude/hooks/tsaver-reroute.cjs";
function readSettings(path) {
    if (!existsSync(path))
        return {};
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch (err) {
        throw new Error(`Could not parse existing ${path}: ${err.message}`);
    }
}
function alreadyInstalled(settings) {
    const groups = settings.hooks?.PreToolUse ?? [];
    return groups.some((g) => g.matcher === "Bash" && g.hooks.some((h) => h.command === HOOK_COMMAND));
}
async function initClaude() {
    const claudeDir = join(homedir(), ".claude");
    const hooksDir = join(claudeDir, "hooks");
    const settingsPath = join(claudeDir, "settings.json");
    const hookScriptPath = join(hooksDir, "tsaver-reroute.cjs");
    if (!existsSync(claudeDir)) {
        process.stderr.write(`tsaver init --claude: ${claudeDir} not found. Is Claude Code installed?\n`);
        return 1;
    }
    // Resolve the real, symlink-free path to this running tsaver's entry
    // point so the hook script never depends on PATH/nvm being set up in
    // whatever shell context Claude Code's hook command runs in.
    const tsaverBinPath = realpathSync(process.argv[1]);
    const settings = readSettings(settingsPath);
    const alreadyHasEntry = alreadyInstalled(settings);
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(hookScriptPath, buildHookScript(tsaverBinPath), { mode: 0o755 });
    if (alreadyHasEntry) {
        process.stdout.write(`Refreshed ${hookScriptPath} to point at ${tsaverBinPath}.\n` +
            "The settings.json hook entry was already present — nothing to change there.\n");
        return 0;
    }
    settings.hooks ??= {};
    settings.hooks.PreToolUse ??= [];
    settings.hooks.PreToolUse.push({
        matcher: "Bash",
        hooks: [{ type: "command", command: HOOK_COMMAND }],
    });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
    process.stdout.write([
        `Installed ${hookScriptPath} (pointing at ${tsaverBinPath})`,
        `Updated ${settingsPath} with a PreToolUse hook on Bash.`,
        "",
        "Claude Code must reload hooks for this to take effect:",
        "  - open /hooks once in your Claude Code session, or",
        "  - restart Claude Code.",
        "",
        "After that, every Bash command Claude runs will be filtered through `tsaver run`.",
    ].join("\n") + "\n");
    return 0;
}
export async function init(args) {
    if (args[0] === "--claude") {
        return initClaude();
    }
    process.stderr.write("Usage: tsaver init --claude\n");
    return 1;
}
