import os from "node:os";
import path from "node:path";
import { resolvePaperclipInstanceRootForAdapter } from "@paperclipai/adapter-utils/server-utils";

export function resolveAccountHome(sessionId: string): string {
  const trimmed = sessionId.trim();
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed);
  const safeName = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-");
  const instanceRoot = resolvePaperclipInstanceRootForAdapter();
  return path.join(instanceRoot, "ai-local-logins", safeName);
}

export function buildTerminalLoginCommand(sessionId: string, command = "agy"): string {
  const accountHome = resolveAccountHome(sessionId);
  return `(export HOME='${accountHome}' && mkdir -p "$HOME" && ${command})`;
}

export function buildLoginInstruction(sessionId: string, command = "agy"): string {
  const cmd = buildTerminalLoginCommand(sessionId, command);
  return `Sign in to Antigravity for this connection on the machine running Paperclip. Your existing terminal login stays separate. Run this in a terminal on that machine and finish signing in in your browser. We'll check automatically when you return: ${cmd}`;
}


