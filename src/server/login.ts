import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const URL_RE = /https:\/\/accounts\.google\.com\/o\/oauth2\/[^\s"'<>]+/;
const PENDING_TTL_MS = 10 * 60 * 1000;

interface PendingLogin {
  child: ChildProcessWithoutNullStreams;
  output: string;
  exited: Promise<number | null>;
  timer: NodeJS.Timeout;
}

/** Live `agy` processes waiting for an OAuth code, keyed by isolated HOME. */
const pending = new Map<string, PendingLogin>();

function dropPending(home: string): void {
  const p = pending.get(home);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(home);
  if (p.child.exitCode === null) p.child.kill("SIGKILL");
}

export type StartLoginResult =
  | { state: "authenticated"; output: string }
  | { state: "needs_code"; url: string }
  | { state: "failed"; output: string; exitCode: number | null };

/**
 * Starts `agy` in an isolated HOME. If it is already logged in it finishes the
 * probe prompt; otherwise it prints an OAuth URL and stays alive (in this
 * server process) waiting for the authorization code via {@link submitLoginCode}.
 */
export async function startLogin(
  command: string,
  env: NodeJS.ProcessEnv,
  home: string,
  waitMs = 60_000,
): Promise<StartLoginResult> {
  dropPending(home);

  const child = spawn(command, ["--dangerously-skip-permissions", "--print=Reply with OK"], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const entry: PendingLogin = {
    child,
    output: "",
    exited: new Promise((resolve) => {
      child.on("exit", (code) => resolve(code));
      child.on("error", () => resolve(null));
    }),
    timer: setTimeout(() => dropPending(home), PENDING_TTL_MS),
  };
  pending.set(home, entry);

  let onUrl: (url: string) => void = () => {};
  const urlSeen = new Promise<string>((resolve) => (onUrl = resolve));
  const collect = (chunk: Buffer) => {
    entry.output += chunk.toString();
    const m = URL_RE.exec(entry.output);
    if (m) onUrl(m[0]);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), waitMs));
  const first = await Promise.race([
    urlSeen.then((url) => ({ kind: "url" as const, url })),
    entry.exited.then((exitCode) => ({ kind: "exit" as const, exitCode })),
    timeout.then(() => ({ kind: "timeout" as const })),
  ]);

  if (first.kind === "url") {
    return { state: "needs_code", url: first.url };
  }
  const output = entry.output.trim();
  dropPending(home);
  if (first.kind === "exit" && first.exitCode === 0) {
    return { state: "authenticated", output };
  }
  return { state: "failed", output, exitCode: first.kind === "exit" ? first.exitCode : null };
}

export type SubmitCodeResult =
  | { ok: true; output: string }
  | { ok: false; reason: "no_pending" | "rejected"; output?: string };

/** Feeds the pasted authorization code to the waiting `agy` process. */
export async function submitLoginCode(home: string, code: string, waitMs = 60_000): Promise<SubmitCodeResult> {
  const entry = pending.get(home);
  if (!entry || entry.child.exitCode !== null) {
    dropPending(home);
    return { ok: false, reason: "no_pending" };
  }
  entry.child.stdin.write(`${code.trim()}\n`);

  const result = await Promise.race([
    entry.exited,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), waitMs)),
  ]);
  const output = entry.output.trim();
  dropPending(home);
  if (result === 0) return { ok: true, output };
  return { ok: false, reason: "rejected", output };
}
