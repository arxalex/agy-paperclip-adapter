import type {
  ServerAdapterModule,
  AdapterSessionCodec,
  AdapterSkillContext,
  AdapterSkillSnapshot,
} from "@paperclipai/adapter-utils";
import { models, DEFAULT_ANTIGRAVITY_MODEL } from "../models.js";
import { icon, iconSvg, iconUrl, iconDataUrl, iconBase64 } from "../icon.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { buildLoginInstruction } from "./account.js";
import { loginCapability } from "./login-capability.js";

export const type = "antigravity";
export const label = "Antigravity";
export { icon, iconSvg, iconUrl, iconDataUrl, iconBase64 };

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const conversationId = r.conversationId ?? r.sessionId;
    return conversationId ? { conversationId: String(conversationId) } : null;
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params?.conversationId && !params?.sessionId) return null;
    return { conversationId: String(params.conversationId ?? params.sessionId) };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    const id = params?.conversationId ?? params?.sessionId;
    return id ? String(id).slice(0, 8) : null;
  },
};

export const agentConfigurationDoc = `# Antigravity Agent Configuration

Adapter: antigravity

Use when:
- You want Paperclip to orchestrate Google Antigravity (agy) local CLI agents.
- You want model selection across Gemini 3.8 Flash, Gemini 3.7 Flash, Gemini 3.6 Flash, Gemini 3.1 Pro, Claude Sonnet/Opus, or GPT-OSS models.
- You want to hire multiple local agents with individual instructions and configurable Paperclip skills.
- You want persistent conversation session state across heartbeats.

Core fields:
- model (string): Antigravity model ID (e.g. gemini-3.8-flash-high, gemini-3.7-flash-high, claude-sonnet-4-6).
- effort (string, optional): Reasoning effort (low, medium, high, max).
- mode (string, optional): accept-edits or plan.
- command (string, optional): agy binary command path (defaults to "agy").
- cwd (string, optional): Working directory fallback.
- instructionsFilePath (string, optional): Path to instructions markdown file (e.g. AGENTS.md).
- timeoutSec (number, optional): Execution timeout in seconds (default: 600).
- accountName (string, optional): Isolated agy account. Runs agy with a separate HOME (<instanceRoot>/ai-local-logins/<name>, or an absolute path) so each agent can use its own Google login and its own ~/.gemini/antigravity-cli context.
- authCode (string, optional): Optional OAuth authorization code from Google login URL.
`;

export function getConfigSchema() {
  return {
    fields: [
      {
        key: "model",
        label: "Model",
        type: "select" as const,
        default: DEFAULT_ANTIGRAVITY_MODEL,
        options: models.map((m) => ({ value: m.id, label: m.label })),
        hint: "Select the AI model for this Antigravity agent.",
      },
      {
        key: "effort",
        label: "Reasoning Effort",
        type: "select" as const,
        default: "high",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "max", label: "Max" },
        ],
        hint: "Reasoning effort level for thinking models.",
      },
      {
        key: "mode",
        label: "Execution Mode",
        type: "select" as const,
        default: "accept-edits",
        options: [
          { value: "accept-edits", label: "Accept Edits" },
          { value: "plan", label: "Plan" },
        ],
        hint: "Execution mode for the Antigravity session.",
      },
      {
        key: "command",
        label: "CLI Command",
        type: "text" as const,
        default: "agy",
        hint: "Override command or binary path for Antigravity CLI.",
      },
      {
        key: "timeoutSec",
        label: "Timeout (seconds)",
        type: "number" as const,
        default: 600,
        hint: "Execution timeout in seconds.",
      },
      {
        key: "accountName",
        label: "Account name (isolated agy login)",
        type: "text" as const,
        hint: "Optional. Separate agy account/context for this agent (stored in <instanceRoot>/ai-local-logins/<name>). Empty = system default login.",
      },
      {
        key: "authCode",
        label: "Auth code (agy login)",
        type: "text" as const,
        hint: "Optional one-time OAuth code if completing login via Test environment.",
      },
    ],
  };
}

const agentDesiredSkillsStore = new Map<string, string[]>();

function getAgentDesiredSkills(ctx: AdapterSkillContext): string[] {
  if (agentDesiredSkillsStore.has(ctx.agentId)) {
    return agentDesiredSkillsStore.get(ctx.agentId)!;
  }
  if (Array.isArray(ctx.config?.desiredSkills)) {
    return ctx.config.desiredSkills.map(String);
  }
  if (Array.isArray(ctx.config?.skills)) {
    return ctx.config.skills.map(String);
  }
  return [];
}

function buildSkillSnapshot(adapterType: string, desiredSkills: string[]): AdapterSkillSnapshot {
  return {
    adapterType,
    supported: true,
    mode: "ephemeral",
    desiredSkills,
    entries: desiredSkills.map((key) => ({
      key,
      runtimeName: key,
      desired: true,
      managed: true,
      state: "installed",
      locationLabel: `.agents/skills/${key}`,
    })),
    warnings: [],
  };
}

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    sessionCodec,
    models,
    agentConfigurationDoc,
    getConfigSchema,
    requiresMaterializedRuntimeSkills: true,
    supportsInstructionsBundle: true,
    instructionsPathKey: "instructionsFilePath",
    supportsLocalAgentJwt: true,
    loginCapability,
    acp: {
      agentId: "custom",
      skillsMode: "ephemeral",
      prerequisites: {},
    },
    async listSkills(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot> {
      const desiredSkills = getAgentDesiredSkills(ctx);
      return buildSkillSnapshot(ctx.adapterType, desiredSkills);
    },
    async syncSkills(ctx: AdapterSkillContext, desiredSkills: string[]): Promise<AdapterSkillSnapshot> {
      agentDesiredSkillsStore.set(ctx.agentId, desiredSkills);
      return buildSkillSnapshot(ctx.adapterType, desiredSkills);
    },
  };
}
