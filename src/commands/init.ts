import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function buildHookScript(tsaverBinPath: string): string {
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

function buildReadHookScript(tsaverBinPath: string): string {
  const escapedBinPath = tsaverBinPath.replace(/"/g, '\\"');
  return `#!/usr/bin/env node
// Installed by \`tsaver init --claude\` — for Read calls on PDFs, Jupyter
// notebooks, or images, runs \`tsaver read --cache\` first and redirects the
// Read to the optimized/extracted output instead of the raw original.
const { execFileSync } = require("node:child_process");
const TSAVER_BIN = ${JSON.stringify(escapedBinPath)};

const OPTIMIZABLE_RE = /\\.(pdf|ipynb|png|jpe?g|gif|webp)$/i;
// Guards against redirecting a Read that's already pointed at tsaver's own
// cache or a previously-written .optimized.<ext> file — avoids pointless
// re-processing if Claude (or the user) reads an already-optimized path.
const ALREADY_OPTIMIZED_RE = /(\\.tsaver[\\\\/]cache[\\\\/]|\\.optimized\\.[^.\\\\/]+$)/i;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== "string" || filePath.trim() === "") {
    process.exit(0);
  }

  if (!OPTIMIZABLE_RE.test(filePath) || ALREADY_OPTIMIZED_RE.test(filePath)) {
    process.exit(0);
  }

  let redirectPath;
  try {
    redirectPath = execFileSync(
      "node",
      [TSAVER_BIN, "read", "--cache", filePath],
      { encoding: "utf8", env: { ...process.env, TSAVER_HOOK_SOURCE: "1" }, timeout: 30000 },
    ).trim();
  } catch {
    // If tsaver read fails for any reason (corrupt file, unsupported edge
    // case), fall through to Claude's normal unmodified Read rather than
    // blocking the tool call.
    process.exit(0);
  }

  if (!redirectPath) {
    process.exit(0);
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { ...input.tool_input, file_path: redirectPath },
      },
    }),
  );
  process.exit(0);
});
`;
}

const HOOK_COMMAND = "node ~/.claude/hooks/tsaver-reroute.cjs";
const READ_HOOK_COMMAND = "node ~/.claude/hooks/tsaver-read-reroute.cjs";

interface ClaudeHookEntry {
  type: string;
  command: string;
  [key: string]: unknown;
}

interface ClaudeMatcherGroup {
  matcher?: string;
  hooks: ClaudeHookEntry[];
  [key: string]: unknown;
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: ClaudeMatcherGroup[];
    [event: string]: ClaudeMatcherGroup[] | undefined;
  };
  [key: string]: unknown;
}

function readSettings(path: string): ClaudeSettings {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Could not parse existing ${path}: ${(err as Error).message}`);
  }
}

function hasHookEntry(settings: ClaudeSettings, matcher: string, command: string): boolean {
  const groups = settings.hooks?.PreToolUse ?? [];
  return groups.some((g) => g.matcher === matcher && g.hooks.some((h) => h.command === command));
}

function addHookEntry(settings: ClaudeSettings, matcher: string, command: string): void {
  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];
  settings.hooks.PreToolUse.push({ matcher, hooks: [{ type: "command", command }] });
}

async function initClaude(): Promise<number> {
  const claudeDir = join(homedir(), ".claude");
  const hooksDir = join(claudeDir, "hooks");
  const settingsPath = join(claudeDir, "settings.json");
  const bashHookScriptPath = join(hooksDir, "tsaver-reroute.cjs");
  const readHookScriptPath = join(hooksDir, "tsaver-read-reroute.cjs");

  if (!existsSync(claudeDir)) {
    process.stderr.write(
      `tsaver init --claude: ${claudeDir} not found. Is Claude Code installed?\n`,
    );
    return 1;
  }

  // Resolve the real, symlink-free path to this running tsaver's entry
  // point so the hook scripts never depend on PATH/nvm being set up in
  // whatever shell context Claude Code's hook commands run in.
  const tsaverBinPath = realpathSync(process.argv[1]);

  const settings = readSettings(settingsPath);
  const bashAlreadyInstalled = hasHookEntry(settings, "Bash", HOOK_COMMAND);
  const readAlreadyInstalled = hasHookEntry(settings, "Read", READ_HOOK_COMMAND);

  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(bashHookScriptPath, buildHookScript(tsaverBinPath), { mode: 0o755 });
  writeFileSync(readHookScriptPath, buildReadHookScript(tsaverBinPath), { mode: 0o755 });

  if (!bashAlreadyInstalled) addHookEntry(settings, "Bash", HOOK_COMMAND);
  if (!readAlreadyInstalled) addHookEntry(settings, "Read", READ_HOOK_COMMAND);

  if (!bashAlreadyInstalled || !readAlreadyInstalled) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  }

  const out: string[] = [
    `${bashAlreadyInstalled ? "Refreshed" : "Installed"} ${bashHookScriptPath}`,
    `${readAlreadyInstalled ? "Refreshed" : "Installed"} ${readHookScriptPath}`,
    `Both point at ${tsaverBinPath}.`,
  ];
  if (!bashAlreadyInstalled || !readAlreadyInstalled) {
    out.push(`Updated ${settingsPath} with new PreToolUse hook entries.`);
  } else {
    out.push(`${settingsPath} already had both hook entries — nothing to change there.`);
  }
  out.push(
    "",
    "Claude Code must reload hooks for this to take effect:",
    "  - open /hooks once in your Claude Code session, or",
    "  - restart Claude Code.",
    "",
    "After that:",
    "  - every Bash command Claude runs will be filtered through `tsaver run`.",
    "  - every Read of a .pdf/.ipynb/image file will be redirected through `tsaver read` first.",
  );

  process.stdout.write(out.join("\n") + "\n");
  return 0;
}

export async function init(args: string[]): Promise<number> {
  if (args[0] === "--claude") {
    return initClaude();
  }

  process.stderr.write("Usage: tsaver init --claude\n");
  return 1;
}
