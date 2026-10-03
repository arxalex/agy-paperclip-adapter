import os from "node:os";
import path from "node:path";

export const ACCOUNTS_ROOT_DIR = path.join(".paperclip", "agy-accounts");

export const LOGIN_HINT =
  'Open Test environment on the agent config page: it shows the Google login URL. Authorize, paste the code into "Auth code", and click Test environment again.';

/**
 * Resolves the isolated HOME directory for an agy account.
 * `agy` keeps its credentials/state under $HOME (~/.gemini/antigravity-cli),
 * so a separate HOME == a separate Google account + separate context.
 *
 * `accountName` may be a plain name (-> ~/.paperclip/agy-accounts/<name>)
 * or an absolute path. Returns null when no isolation is configured.
 */
export function resolveAccountHome(accountName: unknown): string | null {
  if (typeof accountName !== "string") return null;
  const trimmed = accountName.trim();
  if (!trimmed) return null;
  if (path.isAbsolute(trimmed)) return path.normalize(trimmed);
  const safeName = trimmed.replace(/[^a-zA-Z0-9._-]/g, "-");
  return path.join(os.homedir(), ACCOUNTS_ROOT_DIR, safeName);
}
