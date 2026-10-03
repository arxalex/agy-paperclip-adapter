import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

import os from "node:os";
import path from "node:path";
import { resolveAccountHome } from "./account.js";

const execFileAsync = promisify(execFile);

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const command = String(ctx.config.command ?? "agy");
  const useIsolatedAccount = ctx.config.useIsolatedAccount !== false;
  const rawAccount = ctx.config.accountName ?? ctx.config.storedSessionId ?? ctx.config.sessionId;
  const sessionId = typeof rawAccount === "string" ? rawAccount.trim() : "";

  const realHome = process.env.HOME || os.homedir() || "/root";
  const accountHome = (useIsolatedAccount && sessionId) ? resolveAccountHome(sessionId) : null;
  const env = {
    ...process.env,
    HOME: accountHome ?? realHome,
    PATH: `${path.join(realHome, ".local", "bin")}:${process.env.PATH ?? ""}`,
  };

  const checks: AdapterEnvironmentTestResult["checks"] = [];

  try {
    const { stdout } = await execFileAsync(
      command,
      ["--dangerously-skip-permissions", '--print="hello"'],
      { timeout: 15000, env },
    );
    const output = stdout.trim();
    if (/Authentication required/i.test(output)) {
      checks.push({
        level: "warn",
        message: "Antigravity CLI is installed, but login is required.",
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
    const partial = String((err as { stdout?: unknown })?.stdout ?? "");
    if (/Authentication required/i.test(partial)) {
      checks.push({
        level: "warn",
        message: "Antigravity CLI is installed, but login is required.",
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
