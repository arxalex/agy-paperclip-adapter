import path from "node:path";
import { resolvePaperclipInstanceRootForAdapter } from "@paperclipai/adapter-utils/server-utils";

export function resolveIsolatedAgentHome(agentId: string): string {
  if (!agentId || !agentId.trim()) {
    throw new Error("agentId is required to resolve isolated agent home");
  }
  const trimmed = agentId.trim();
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed);
  const safeName = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-");
  const instanceRoot = resolvePaperclipInstanceRootForAdapter();
  return path.join(instanceRoot, "ai-local-logins", safeName);
}

export function buildTerminalLoginCommand(agentId: string, command = "agy"): string {
  if (!agentId || !agentId.trim()) {
    throw new Error("agentId is required to build terminal login command");
  }
  const accountHome = resolveIsolatedAgentHome(agentId);
  return `(export HOME='${accountHome}' && mkdir -p "$HOME" && ${command})`;
}

export function buildLoginInstruction(agentId: string, command = "agy"): string {
  if (!agentId || !agentId.trim()) {
    throw new Error("agentId is required to build login instruction");
  }
  const cmd = buildTerminalLoginCommand(agentId, command);
  return `Sign in to Antigravity for this connection on the machine running Paperclip. Your existing terminal login stays separate. Run this in a terminal on that machine and finish signing in in your browser. We'll check automatically when you return: ${cmd}`;
}
