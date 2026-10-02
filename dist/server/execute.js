import fs from "node:fs/promises";
import crypto from "node:crypto";
import { runChildProcess, buildPaperclipEnv, renderTemplate, DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE, } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_ANTIGRAVITY_MODEL } from "../models.js";
function buildPrompt(ctx) {
    const { config, agent, context } = ctx;
    const template = typeof config.promptTemplate === "string" && config.promptTemplate.trim().length > 0
        ? config.promptTemplate
        : DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE;
    const data = {
        agentId: agent.id,
        agentName: agent.name,
        companyId: agent.companyId,
        runId: ctx.runId,
        taskId: context?.taskId ?? "",
        taskTitle: context?.taskTitle ?? "",
        wakeReason: context?.wakeReason ?? "",
    };
    let rendered = renderTemplate(template, data);
    if (typeof context?.taskDescription === "string" && context.taskDescription.trim().length > 0) {
        rendered += `\n\n## Task Details\n${context.taskDescription}`;
    }
    return rendered;
}
export async function execute(ctx) {
    const { config, agent, runId, onLog } = ctx;
    const command = String(config.command ?? "agy");
    const model = String(config.model ?? DEFAULT_ANTIGRAVITY_MODEL);
    const effort = config.effort ? String(config.effort) : null;
    const mode = config.mode ? String(config.mode) : null;
    const cwd = String(config.cwd ?? process.cwd());
    const timeoutSec = Number(config.timeoutSec ?? 600);
    const graceSec = Number(config.graceSec ?? 15);
    // Maintain conversation session
    const prevConversationId = typeof ctx.runtime?.sessionParams?.conversationId === "string"
        ? ctx.runtime.sessionParams.conversationId
        : typeof ctx.runtime?.sessionId === "string"
            ? ctx.runtime.sessionId
            : null;
    const conversationId = prevConversationId ?? crypto.randomUUID();
    // Build Paperclip env
    const paperclipEnv = buildPaperclipEnv(agent);
    const env = {
        ...process.env,
        ...paperclipEnv,
        PATH: `/root/.local/bin:${process.env.PATH ?? ""}`,
        PAPERCLIP_RUN_ID: runId,
    };
    // Add custom env vars from config if present
    if (typeof config.env === "object" && config.env !== null) {
        for (const [k, v] of Object.entries(config.env)) {
            if (typeof v === "string")
                env[k] = v;
        }
    }
    // Prepend instructions if specified
    let promptText = buildPrompt(ctx);
    const instructionsPath = config.instructionsFilePath
        ? String(config.instructionsFilePath)
        : null;
    if (instructionsPath) {
        try {
            const instructions = await fs.readFile(instructionsPath, "utf-8");
            promptText = `${instructions}\n\n---\n\n${promptText}`;
        }
        catch {
            // Ignore missing instructions file
        }
    }
    // Build agy arguments
    const args = ["--print", "--dangerously-skip-permissions"];
    if (model && model !== "auto") {
        args.push("--model", model);
    }
    if (effort) {
        args.push("--effort", effort);
    }
    if (mode) {
        args.push("--mode", mode);
    }
    if (prevConversationId) {
        args.push("--conversation", prevConversationId);
    }
    args.push(promptText);
    await onLog("stdout", `[antigravity] Starting agy session (model: ${model}, conversation: ${conversationId})...\n`);
    try {
        const processResult = await runChildProcess(runId, command, args, {
            cwd,
            env,
            timeoutSec,
            graceSec,
            onLog: async (stream, chunk) => {
                await onLog(stream, chunk);
            },
        });
        const isSuccess = processResult.exitCode === 0;
        return {
            exitCode: processResult.exitCode,
            signal: processResult.signal,
            timedOut: processResult.timedOut,
            provider: "antigravity",
            model,
            sessionId: conversationId,
            sessionDisplayId: conversationId.slice(0, 8),
            sessionParams: {
                conversationId,
                cwd,
                model,
            },
            errorMessage: isSuccess ? null : `agy exited with code ${processResult.exitCode}`,
            summary: isSuccess ? "Completed Antigravity run" : `Run failed with exit code ${processResult.exitCode}`,
        };
    }
    catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await onLog("stderr", `[antigravity] Error executing agy: ${errorMsg}\n`);
        return {
            exitCode: 1,
            signal: null,
            timedOut: false,
            provider: "antigravity",
            model,
            errorMessage: errorMsg,
            summary: `Antigravity execution failed: ${errorMsg}`,
        };
    }
}
