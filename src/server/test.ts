import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

import os from "node:os";
import path from "node:path";
import { buildTerminalLoginCommand, resolveIsolatedAgentHome, extractAgentIdFromText } from "./account.js";

const execFileAsync = promisify(execFile);

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const command = String(ctx.config.command ?? "agy");
  const useIsolatedAccount = Boolean(ctx.config.useIsolatedAccount);
  const ctxAgentId =
    (typeof ctx.config.agentId === "string" && ctx.config.agentId.trim()) ||
    (typeof document !== "undefined" && document.body?.innerHTML) ||
    "";

  const agentId = typeof ctxAgentId === "string" ? extractAgentIdFromText(ctxAgentId) ?? ctxAgentId.trim() : "";

  const checks: AdapterEnvironmentTestResult["checks"] = [];

  if (!agentId) {
    checks.push({
      level: "error",
      message: "agentId is required for testEnvironment.",
      code: "missing_agent_id",
    });
    return {
      adapterType: ctx.adapterType,
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  const realHome = process.env.HOME || os.homedir();
  if (!realHome) {
    checks.push({
      level: "error",
      message: "Unable to determine user HOME directory.",
      code: "missing_home_dir",
    });
    return {
      adapterType: ctx.adapterType,
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  const accountHome = useIsolatedAccount ? resolveIsolatedAgentHome(agentId) : null;
  const env = {
    ...process.env,
    HOME: accountHome ?? realHome,
    PATH: `${path.join(realHome, ".local", "bin")}:${process.env.PATH ?? ""}`,
  };

  try {
    const { stdout } = await execFileAsync(
      command,
      ["--dangerously-skip-permissions", '--print="hello"'],
      { timeout: 15000, env },
    );
    const output = stdout.trim();
    if (/Authentication required|Not logged in|login required/i.test(output)) {
      const loginCmd = buildTerminalLoginCommand(agentId, command);
      checks.push({
        level: "error",
        message: `Antigravity CLI login required for account (${accountHome ?? realHome}). Run: ${loginCmd}`,
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
    const partial = String((err as { stdout?: unknown; stderr?: unknown })?.stdout ?? "") +
      " " + String((err as { stdout?: unknown; stderr?: unknown })?.stderr ?? "");
    if (/Authentication required|Not logged in|login required/i.test(partial)) {
      const loginCmd = buildTerminalLoginCommand(agentId, command);
      checks.push({
        level: "error",
        message: `Antigravity CLI login required for account (${accountHome ?? realHome}). Run: ${loginCmd}`,
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
