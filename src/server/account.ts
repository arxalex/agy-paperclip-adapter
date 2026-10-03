import os from "node:os";
import path from "node:path";
import { resolvePaperclipInstanceRootForAdapter } from "@paperclipai/adapter-utils/server-utils";

export function resolveAccountHome(accountName: unknown): string | null {
  if (typeof accountName !== "string") return null;
  const trimmed = accountName.trim();
  if (!trimmed) return null;
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed);
  const safeName = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-");
  const instanceRoot = resolvePaperclipInstanceRootForAdapter();
  return path.join(instanceRoot, "ai-local-logins", safeName);
}

export function buildTerminalLoginCommand(accountName: unknown, command = "agy"): string {
  const accountHome = resolveAccountHome(accountName) ?? (process.env.HOME || os.homedir() || "/root");
  return `(export HOME='${accountHome}' && mkdir -p "$HOME" && ${command})`;
}

export function buildLoginInstruction(accountName: unknown, command = "agy"): string {
  const cmd = buildTerminalLoginCommand(accountName, command);
  return `Sign in to Antigravity for this connection on the machine running Paperclip. Your existing terminal login stays separate. Run this in a terminal on that machine and finish signing in in your browser. We'll check automatically when you return: ${cmd}`;
}


