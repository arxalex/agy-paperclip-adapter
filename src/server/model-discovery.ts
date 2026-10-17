import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import type { AdapterModel } from "@paperclipai/adapter-utils";
import { models as fallbackModels } from "../models.js";

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { at: number; models: AdapterModel[] } | null = null;

/** Parses `agy models` output: one "<id>\t<label>" line per model, after a "Fetching…" banner. */
export function parseAgyModels(stdout: string): AdapterModel[] {
  const parsed: AdapterModel[] = [];
  for (const line of stdout.split("\n")) {
    const match = line.match(/^([a-z0-9][a-z0-9._-]*)\t+(.+)$/i);
    if (match) parsed.push({ id: match[1], label: match[2].trim() });
  }
  return parsed;
}

/** Runs `agy models` with the same PATH the adapter uses for runs. Throws if agy fails or lists nothing. */
export async function discoverModels(command = "agy", home?: string): Promise<AdapterModel[]> {
  const realHome = process.env.HOME || os.homedir();
  const env = {
    ...process.env,
    ...(home ? { HOME: home } : {}),
    PATH: realHome ? `${path.join(realHome, ".local", "bin")}:${process.env.PATH ?? ""}` : process.env.PATH,
  };
  const { stdout } = await execFileAsync(command, ["models"], { timeout: 20000, env });
  const discovered = parseAgyModels(stdout);
  if (discovered.length === 0) throw new Error("agy models listed no models");
  // execute() treats "auto" specially (no --model flag), so keep offering it.
  if (!discovered.some((m) => m.id === "auto")) discovered.push({ id: "auto", label: "Auto" });
  return discovered;
}

/** The models agy offers right now, cached for 10 minutes; the built-in list if agy can't be asked. */
export async function listModels(): Promise<AdapterModel[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models;
  return refreshModels();
}

/** Like listModels, but always asks agy again. */
export async function refreshModels(): Promise<AdapterModel[]> {
  try {
    const discovered = await discoverModels();
    cache = { at: Date.now(), models: discovered };
    return discovered;
  } catch {
    return fallbackModels;
  }
}
