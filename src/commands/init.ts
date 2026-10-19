import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOOK_SCRIPT = `#!/usr/bin/env node
// Installed by \`tsaver init --claude\` — reroutes Bash tool calls through
// \`tsaver run\` so their output is filtered before it reaches Claude's context.
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
  if (/^tsaver\\s+run\\b/.test(trimmed)) {
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
  const newCommand = \`tsaver run -- bash -c '\${escaped}'\`;

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

const HOOK_COMMAND = "node ~/.claude/hooks/tsaver-reroute.cjs";

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

function alreadyInstalled(settings: ClaudeSettings): boolean {
  const groups = settings.hooks?.PreToolUse ?? [];
  return groups.some(
    (g) => g.matcher === "Bash" && g.hooks.some((h) => h.command === HOOK_COMMAND),
  );
}

async function initClaude(): Promise<number> {
  const claudeDir = join(homedir(), ".claude");
  const hooksDir = join(claudeDir, "hooks");
  const settingsPath = join(claudeDir, "settings.json");
  const hookScriptPath = join(hooksDir, "tsaver-reroute.cjs");

  if (!existsSync(claudeDir)) {
    process.stderr.write(
      `tsaver init --claude: ${claudeDir} not found. Is Claude Code installed?\n`,
    );
    return 1;
  }

  const settings = readSettings(settingsPath);

  if (alreadyInstalled(settings)) {
    process.stdout.write("tsaver hook already installed in ~/.claude/settings.json — nothing to do.\n");
    return 0;
  }

  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hookScriptPath, HOOK_SCRIPT, { mode: 0o755 });

  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];
  settings.hooks.PreToolUse.push({
    matcher: "Bash",
    hooks: [{ type: "command", command: HOOK_COMMAND }],
  });

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");

  process.stdout.write(
    [
      `Installed ${hookScriptPath}`,
      `Updated ${settingsPath} with a PreToolUse hook on Bash.`,
      "",
      "Claude Code must reload hooks for this to take effect:",
      "  - open /hooks once in your Claude Code session, or",
      "  - restart Claude Code.",
      "",
      "After that, every Bash command Claude runs will be filtered through `tsaver run`.",
    ].join("\n") + "\n",
  );

  return 0;
}

export async function init(args: string[]): Promise<number> {
  if (args[0] === "--claude") {
    return initClaude();
  }

  process.stderr.write("Usage: tsaver init --claude\n");
  return 1;
}
