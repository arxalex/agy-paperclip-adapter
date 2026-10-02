import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

const execFileAsync = promisify(execFile);

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentTestResult["checks"] = [];
  const command = String(ctx.config.command ?? "agy");

  try {
    const { stdout: versionStdout } = await execFileAsync(command, ["--version"], {
      timeout: 5000,
    });
    const version = versionStdout.trim();
    checks.push({
      level: "info",
      message: `Antigravity CLI detected: ${version}`,
      code: "agy_cli_detected",
    });
  } catch (err) {
    checks.push({
      level: "error",
      message: `Failed to execute Antigravity CLI command "${command}": ${err instanceof Error ? err.message : String(err)}`,
      hint: "Ensure 'agy' is installed in PATH (e.g. /root/.local/bin/agy) or specify adapterConfig.command.",
      code: "agy_cli_missing",
    });
  }

  // Execution probe: test agy with a prompt command
  try {
    const { stdout: probeStdout } = await execFileAsync(
      command,
      ["--dangerously-skip-permissions", '--print="Say hello world"'],
      { timeout: 15000 },
    );
    const responseText = probeStdout.trim().slice(0, 150);
    checks.push({
      level: "info",
      message: `Antigravity CLI probe response: ${responseText || "OK"}`,
      code: "agy_probe_success",
    });
  } catch (err) {
    checks.push({
      level: "warn",
      message: `Antigravity execution probe failed: ${err instanceof Error ? err.message : String(err)}`,
      hint: "Check Antigravity API keys, network connection, or permissions.",
      code: "agy_probe_failed",
    });
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
