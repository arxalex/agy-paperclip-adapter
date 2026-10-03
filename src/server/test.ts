import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

import os from "node:os";
import path from "node:path";
import { resolveAccountHome, LOGIN_HINT } from "./account.js";
import { startLogin, submitLoginCode } from "./login.js";

const execFileAsync = promisify(execFile);

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentTestResult["checks"] = [];
  const command = String(ctx.config.command ?? "agy");

  const realHome = process.env.HOME || os.homedir() || "/root";
  const accountHome = resolveAccountHome(ctx.config.accountName);
  const env = {
    ...process.env,
    HOME: accountHome ?? realHome,
    PATH: `${path.join(realHome, ".local", "bin")}:${process.env.PATH ?? ""}`,
  };

  if (accountHome) {
    checks.push({
      level: "info",
      message: `Using isolated agy account "${String(ctx.config.accountName)}" (HOME=${accountHome})`,
      code: "agy_account_isolated",
    });
  }

  const authCode = typeof ctx.config.authCode === "string" ? ctx.config.authCode.trim() : "";

  if (accountHome) {
    // Isolated account: run the OAuth login flow inside this (already running) server process.
    let handled = false;
    if (authCode) {
      const submitted = await submitLoginCode(accountHome, authCode);
      if (submitted.ok) {
        handled = true;
        checks.push({
          level: "info",
          message: `Logged in. Antigravity responded: ${submitted.output.slice(0, 200) || "OK"}`,
          hint: 'Clear the "Auth code" field.',
          code: "agy_login_succeeded",
        });
      } else if (submitted.reason === "rejected") {
        handled = true;
        checks.push({
          level: "error",
          message: "Authorization code was rejected or expired.",
          detail: submitted.output?.slice(0, 500) ?? null,
          hint: "Click Test environment again to get a fresh login URL.",
          code: "agy_login_rejected",
        });
      }
      // reason === "no_pending": fall through and start a fresh login below.
    }
    if (!handled) {
      const started = await startLogin(command, env, accountHome);
      if (started.state === "authenticated") {
        checks.push({
          level: "info",
          message: `Antigravity execution test succeeded: ${started.output.slice(0, 200) || "OK"}`,
          code: "agy_test_executed",
        });
      } else if (started.state === "needs_code") {
        checks.push({
          level: "error",
          message: `Not logged in. Open this URL, authorize, and copy the code: ${started.url}`,
          hint: LOGIN_HINT,
          code: "agy_login_required",
        });
      } else {
        checks.push({
          level: "error",
          message: `Failed to execute Antigravity CLI command "${command}" (exit ${started.exitCode ?? "n/a"}): ${started.output.slice(0, 300)}`,
          hint: "Ensure 'agy' is installed in PATH or specify adapterConfig.command.",
          code: "agy_test_failed",
        });
      }
    }
  } else {
    try {
      const { stdout } = await execFileAsync(
        command,
        ["--dangerously-skip-permissions", '--print="hello"'],
        { timeout: 15000, env },
      );
      const output = stdout.trim();
      if (/Authentication required/i.test(output)) {
        checks.push({
          level: "error",
          message: "Antigravity CLI is not logged in.",
          hint: "Run `agy` once to log in, or set an Account name for an isolated login.",
          code: "agy_not_authenticated",
        });
      } else {
        checks.push({
          level: "info",
          message: `Antigravity execution test succeeded: ${output.slice(0, 200) || "OK"}`,
          code: "agy_test_executed",
        });
      }
    } catch (err) {
      const partial = String((err as { stdout?: unknown })?.stdout ?? "");
      if (/Authentication required/i.test(partial)) {
        checks.push({
          level: "error",
          message: "Antigravity CLI is not logged in.",
          hint: "Run `agy` once to log in, or set an Account name for an isolated login.",
          code: "agy_not_authenticated",
        });
      } else {
        checks.push({
          level: "error",
          message: `Failed to execute Antigravity CLI command "${command}": ${err instanceof Error ? err.message : String(err)}`,
          hint: "Ensure 'agy' is installed in PATH (e.g. /root/.local/bin/agy) or specify adapterConfig.command.",
          code: "agy_test_failed",
        });
      }
    }
  }

  const cwd = ctx.config.cwd ? String(ctx.config.cwd) : null;
  if (cwd && !cwd.startsWith("/")) {
    checks.push({
      level: "error",
      message: `Working directory must be an absolute path: "${cwd}"`,
      hint: "Specify an absolute path such as /root or a workspace directory.",
      code: "invalid_cwd",
    });
  }

  const hasError = checks.some((c: AdapterEnvironmentTestResult["checks"][number]) => c.level === "error");

  return {
    adapterType: ctx.adapterType,
    status: hasError ? "fail" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
