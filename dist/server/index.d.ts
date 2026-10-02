import type { ServerAdapterModule, AdapterSessionCodec } from "@paperclipai/adapter-utils";
export declare const type = "antigravity";
export declare const label = "Antigravity";
export declare const sessionCodec: AdapterSessionCodec;
export declare const agentConfigurationDoc = "# antigravity agent configuration\n\nAdapter: antigravity\n\nUse when:\n- You want Paperclip to orchestrate Google Antigravity (agy) agents.\n- You want to use Gemini 3.8 Flash, Gemini 3.7 Flash, Claude Sonnet, or GPT-OSS models via Antigravity.\n- You want persistent conversation session state across heartbeats.\n\nCore fields:\n- model (string): Antigravity model ID (e.g. gemini-3.8-flash-high, gemini-3.7-flash-high, claude-sonnet-4-6).\n- effort (string, optional): Reasoning effort (low, medium, high, max).\n- mode (string, optional): accept-edits or plan.\n- command (string, optional): agy binary command path (defaults to \"agy\").\n- cwd (string, optional): Working directory fallback.\n- instructionsFilePath (string, optional): Path to instructions markdown file (e.g. AGENTS.md).\n- timeoutSec (number, optional): Execution timeout in seconds (default: 600).\n";
export declare function getConfigSchema(): {
    fields: ({
        key: string;
        label: string;
        type: "select";
        default: string;
        options: {
            value: string;
            label: string;
        }[];
        hint: string;
    } | {
        options?: undefined;
        key: string;
        label: string;
        type: "text";
        default: string;
        hint: string;
    } | {
        options?: undefined;
        key: string;
        label: string;
        type: "number";
        default: number;
        hint: string;
    })[];
};
export declare function createServerAdapter(): ServerAdapterModule;
