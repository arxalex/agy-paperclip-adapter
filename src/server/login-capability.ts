import type { AdapterLoginCapability, AdapterLoginPrompt } from "@paperclipai/adapter-utils";

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const URL_START = "https://accounts.google.com/o/oauth2/";

/**
 * Extracts the Google OAuth URL that `agy` prints when it is not logged in.
 * The terminal may hard-wrap the long URL, so whitespace is stripped between the
 * URL start and the following blank line / "Waiting for authentication" line.
 * Returns null while the URL is not (fully) printed yet.
 */
export function parseAgyLoginPrompt(output: string): AdapterLoginPrompt | null {
  const clean = output.replace(ANSI_RE, "");
  const start = clean.indexOf(URL_START);
  if (start === -1) return null;

  const rest = clean.slice(start);
  // The URL ends at the first blank line (agy prints one before "Waiting for ...").
  const end = rest.search(/\r?\n[ \t]*\r?\n|Waiting for authentication/);
  if (end === -1) return null; // URL not complete yet

  const url = rest.slice(0, end).replace(/\s+/g, "");
  if (!url.startsWith(URL_START) || !/[?&]state=/.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "accounts.google.com") return null;
  } catch {
    return null;
  }
  return { url };
}

/**
 * Login capability for the Paperclip "Log in" button (create-agent page for
 * sandbox runner providers). `agy` prints a Google OAuth URL and asks for the
 * authorization code to be pasted back, which maps to `submitted_browser_code`.
 */
export const loginCapability: AdapterLoginCapability = {
  panelMode: "submitted_browser_code",
  timeoutPolicy: "caller_bounded",
  getCommand: () => "agy --dangerously-skip-permissions --print='Reply with OK'",
  parsePrompt: parseAgyLoginPrompt,
};
