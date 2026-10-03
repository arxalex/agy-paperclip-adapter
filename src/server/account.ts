import path from "node:path";
import { resolvePaperclipInstanceRootForAdapter } from "@paperclipai/adapter-utils/server-utils";

/**
 * Extracts a clean agent ID from user input, URLs, raw UUIDs, or labeled strings.
 */
export function extractAgentIdFromText(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. URL Query Parameter (?agentId=... or &agentId=...)
  const queryMatch = trimmed.match(/[?&]agentId=([a-zA-Z0-9._-]+)/i);
  if (queryMatch) return queryMatch[1];

  // 2. URL path (/agents/<id>)
  const pathMatch = trimmed.match(/\/agents\/([a-zA-Z0-9._-]+)/);
  if (pathMatch) return pathMatch[1];

  // 3. Labeled prefix ("Agent ID: <id>")
  const labelMatch = trimmed.match(/(?:agent\s*id|agent):\s*([a-zA-Z0-9._-]+)/i);
  if (labelMatch) return labelMatch[1];

  // 4. Clean single identifier
  if (/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}


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
