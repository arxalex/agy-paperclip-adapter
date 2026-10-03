export const type = "antigravity";
export const label = "Antigravity";

export { icon, iconSvg, iconUrl, iconDataUrl, iconBase64 } from "./icon.js";
export { models, DEFAULT_ANTIGRAVITY_MODEL } from "./models.js";
export { parseStdoutLine } from "./ui-parser.js";
export {
  agentConfigurationDoc,
  createServerAdapter,
  sessionCodec,
  getConfigSchema,
  extractAgentIdFromText,
  resolveIsolatedAgentHome,
  buildTerminalLoginCommand,
  buildLoginInstruction,
} from "./server/index.js";
