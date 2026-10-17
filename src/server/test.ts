import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import os from "node:os";
import path from "node:path";
import { buildTerminalLoginCommand, resolveIsolatedAgentHome } from "./account.js";
import { discoverModels } from "./model-discovery.js";

const execFileAsync = promisify(execFile);

/** The agent being tested. Paperclip doesn't put it on the test context yet, so `config.agentId` is the fallback. */
function resolveTestAgentId(ctx: AdapterEnvironmentTestContext): string | null {
  const fromContext = (ctx as { agentId?: unknown }).agentId;
  const raw = typeof fromContext === "string" && fromContext.trim() ? fromContext : ctx.config.agentId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const command = String(ctx.config.command ?? "agy");
  const checks: AdapterEnvironmentTestResult["checks"] = [];

  // With a separate account, runs use that agent's own HOME, so the test has to sign in the same way.
  const agentId = resolveTestAgentId(ctx);
  const useIsolatedAccount = Boolean(ctx.config.useIsolatedAccount);
  const accountHome = useIsolatedAccount && agentId ? resolveIsolatedAgentHome(agentId) : null;
  const loginHint = accountHome && agentId ? buildTerminalLoginCommand(agentId, command) : command;
  if (useIsolatedAccount && !agentId) {
    checks.push({
      level: "warn",
      message:
        "This agent uses a separate Antigravity account, but the test doesn't know which agent it is, so it checked the default login instead. Set agentId in the adapter config to test that agent's own login.",
      code: "agy_isolated_account_untested",
    });
  }

  const realHome = process.env.HOME || os.homedir();
  const env = {
    ...process.env,
    ...(accountHome ? { HOME: accountHome } : {}),
    PATH: realHome ? `${path.join(realHome, ".local", "bin")}:${process.env.PATH ?? ""}` : process.env.PATH,
  };

  try {
    const { stdout } = await execFileAsync(
      command,
      ["--dangerously-skip-permissions", '--print="hello"'],
      { timeout: 15000, env },
    );
    const output = stdout.trim();
    if (/Authentication required|Not logged in|login required/i.test(output)) {
      checks.push({
        level: "error",
        message: `Antigravity CLI login required. Run: ${loginHint}`,
        code: "adapter_auth_missing",
      });
    } else {
      checks.push({
        level: "info",
        message: `Antigravity CLI execution test succeeded: ${output.slice(0, 200) || "OK"}`,
        code: "agy_test_executed",
      });
    }
  } catch (err) {
    const partial =
      String((err as { stdout?: unknown; stderr?: unknown })?.stdout ?? "") +
      " " +
      String((err as { stdout?: unknown; stderr?: unknown })?.stderr ?? "");
    if (/Authentication required|Not logged in|login required/i.test(partial)) {
      checks.push({
        level: "error",
        message: `Antigravity CLI login required. Run: ${loginHint}`,
        code: "adapter_auth_missing",
      });
    } else {
      checks.push({
        level: "error",
        message: `Failed to execute Antigravity CLI command "${command}": ${err instanceof Error ? err.message : String(err)}`,
        code: "agy_test_failed",
      });
    }
  }

  // agy rejects a model it doesn't know, so a renamed or retired model fails every run; catch it here.
  const model = typeof ctx.config.model === "string" ? ctx.config.model.trim() : "";
  if (model && model !== "auto") {
    try {
      const available = await discoverModels(command, accountHome ?? undefined);
      if (!available.some((m) => m.id === model)) {
        checks.push({
          level: "error",
          message: `agy doesn't offer the model "${model}". Available: ${available.map((m) => m.id).join(", ")}`,
          code: "agy_model_unavailable",
        });
      }
    } catch (err) {
      checks.push({
        level: "warn",
        message: `Couldn't list agy's models to check "${model}": ${err instanceof Error ? err.message : String(err)}`,
        code: "agy_models_unlisted",
      });
    }
  }

  const cwd = ctx.config.cwd ? String(ctx.config.cwd) : null;
  if (cwd && !cwd.startsWith("/")) {
    checks.push({
      level: "error",
      message: `Working directory must be an absolute path: "${cwd}"`,
      code: "invalid_cwd",
    });
  }

  const hasError = checks.some((c) => c.level === "error");

  return {
    adapterType: ctx.adapterType,
    status: hasError ? "fail" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
