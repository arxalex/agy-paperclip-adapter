import fs from "node:fs/promises";
import crypto from "node:crypto";
import { runChildProcess, buildPaperclipEnv, applyPaperclipWorkspaceEnv, renderPaperclipWakePrompt, renderTemplate, joinPromptSections, stringifyPaperclipWakePayload, parseObject, asString, DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE, } from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_ANTIGRAVITY_MODEL } from "../models.js";
import { syncSkillsToWorkspace } from "./skills-sync.js";
function parseSkills(raw) {
    if (!Array.isArray(raw))
        return [];
    const items = [];
    for (const item of raw) {
        if (typeof item === "object" && item !== null) {
            const obj = item;
            if (typeof obj.name === "string" && obj.name.trim().length > 0) {
                const files = [];
                if (Array.isArray(obj.files)) {
                    for (const f of obj.files) {
                        if (typeof f === "object" && f !== null) {
                            const fileObj = f;
                            if (typeof fileObj.path === "string" && fileObj.path.trim().length > 0) {
                                files.push({
                                    path: fileObj.path,
                                    content: typeof fileObj.content === "string" ? fileObj.content : "",
                                });
                            }
                        }
                    }
                }
                items.push({
                    id: typeof obj.id === "string" ? obj.id : undefined,
                    name: obj.name,
                    description: typeof obj.description === "string" ? obj.description : undefined,
                    instructions: typeof obj.instructions === "string" ? obj.instructions : undefined,
                    content: typeof obj.content === "string" ? obj.content : undefined,
                    files: files.length > 0 ? files : undefined,
                });
            }
        }
    }
    return items;
}
function buildPrompt(ctx) {
    const { config, agent, context } = ctx;
    const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, {
        conversationMode: context.conversationMode === true,
        resumedSession: Boolean(ctx.runtime.sessionId),
        suppressIssueDescription: false,
    });
    const template = typeof config.promptTemplate === "string" && config.promptTemplate.trim().length > 0
        ? config.promptTemplate
        : DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE;
    const data = {
        agentId: agent.id,
        agentName: agent.name,
        companyId: agent.companyId,
        runId: ctx.runId,
        taskId: asString(context.taskId, ""),
        taskTitle: asString(context.taskTitle, ""),
        wakeReason: asString(context.wakeReason, ""),
    };
    const renderedTemplate = renderTemplate(template, data);
    const sections = [];
    const agentInstructions = asString(context.agentInstructions, "");
    if (agentInstructions.trim().length > 0) {
        sections.push(`## Agent Role & Instructions\n${agentInstructions.trim()}`);
    }
    if (wakePrompt && wakePrompt.trim().length > 0) {
        sections.push(wakePrompt);
    }
    sections.push(renderedTemplate);
    const taskDescription = asString(context.taskDescription, "");
    if (taskDescription.trim().length > 0) {
        sections.push(`## Task Details\n${taskDescription.trim()}`);
    }
    return joinPromptSections(sections);
}
export async function execute(ctx) {
    const { config, agent, runId, onLog, context } = ctx;
    const command = String(config.command ?? "agy");
    const model = String(config.model ?? DEFAULT_ANTIGRAVITY_MODEL);
    const effort = config.effort ? String(config.effort) : null;
    const mode = config.mode ? String(config.mode) : null;
    const timeoutSec = Number(config.timeoutSec ?? 600);
    const graceSec = Number(config.graceSec ?? 15);
    const prevConversationId = typeof ctx.runtime.sessionParams?.conversationId === "string"
        ? ctx.runtime.sessionParams.conversationId
        : typeof ctx.runtime.sessionId === "string"
            ? ctx.runtime.sessionId
            : null;
    const conversationId = prevConversationId ?? `${agent.id}-${crypto.randomUUID()}`;
    const workspaceContext = parseObject(context.paperclipWorkspace);
    const workspaceCwd = asString(workspaceContext.cwd, "");
    const effectiveCwd = workspaceCwd || String(config.cwd ?? process.cwd());
    try {
        await fs.mkdir(effectiveCwd, { recursive: true });
    }
    catch {
        // Ignore directory creation error
    }
    const skillsList = parseSkills(context.skills);
    const syncedSkills = await syncSkillsToWorkspace(effectiveCwd, skillsList);
    const paperclipEnv = buildPaperclipEnv(agent);
    const env = {
        ...process.env,
        ...paperclipEnv,
        HOME: process.env.HOME || "/root",
        PATH: `/root/.local/bin:${process.env.PATH ?? ""}`,
        PAPERCLIP_RUN_ID: runId,
    };
    if (ctx.authToken) {
        env.PAPERCLIP_API_KEY = ctx.authToken;
    }
    const wakeTaskId = asString(context.taskId, "") || asString(context.issueId, "");
    if (wakeTaskId.trim().length > 0) {
        env.PAPERCLIP_TASK_ID = wakeTaskId.trim();
    }
    const wakeReason = asString(context.wakeReason, "");
    if (wakeReason.trim().length > 0) {
        env.PAPERCLIP_WAKE_REASON = wakeReason.trim();
    }
    const wakeCommentId = asString(context.wakeCommentId, "") || asString(context.commentId, "");
    if (wakeCommentId.trim().length > 0) {
        env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId.trim();
    }
    const approvalId = asString(context.approvalId, "");
    if (approvalId.trim().length > 0) {
        env.PAPERCLIP_APPROVAL_ID = approvalId.trim();
    }
    const approvalStatus = asString(context.approvalStatus, "");
    if (approvalStatus.trim().length > 0) {
        env.PAPERCLIP_APPROVAL_STATUS = approvalStatus.trim();
    }
    const linkedIssueIds = [];
    if (Array.isArray(context.issueIds)) {
        for (const item of context.issueIds) {
            if (typeof item === "string" && item.trim().length > 0) {
                linkedIssueIds.push(item.trim());
            }
        }
    }
    if (linkedIssueIds.length > 0) {
        env.PAPERCLIP_LINKED_ISSUE_IDS = linkedIssueIds.join(",");
    }
    const wakePayloadJson = stringifyPaperclipWakePayload(context.paperclipWake);
    if (wakePayloadJson) {
        env.PAPERCLIP_WAKE_PAYLOAD_JSON = wakePayloadJson;
    }
    applyPaperclipWorkspaceEnv(env, {
        workspaceCwd: effectiveCwd,
        workspaceSource: asString(workspaceContext.source, ""),
        workspaceStrategy: asString(workspaceContext.strategy, ""),
        workspaceId: asString(workspaceContext.workspaceId, "") || null,
        workspaceRepoUrl: asString(workspaceContext.repoUrl, "") || null,
        workspaceRepoRef: asString(workspaceContext.repoRef, "") || null,
        workspaceBranch: asString(workspaceContext.branchName, "") || null,
        workspaceWorktreePath: asString(workspaceContext.worktreePath, "") || null,
        agentHome: asString(workspaceContext.agentHome, "") || null,
    });
    if (typeof config.env === "object" && config.env !== null) {
        for (const [k, v] of Object.entries(config.env)) {
            if (typeof v === "string")
                env[k] = v;
        }
    }
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
    if (syncedSkills.length > 0) {
        await onLog("stdout", `[antigravity] Synchronized ${syncedSkills.length} skill(s) for agent "${agent.name}": ${syncedSkills.join(", ")}\n`);
    }
    const args = ["--dangerously-skip-permissions"];
    if (model && model !== "auto") {
        args.push(`--model=${model}`);
    }
    if (effort) {
        args.push(`--effort=${effort}`);
    }
    if (mode) {
        args.push(`--mode=${mode}`);
    }
    if (prevConversationId) {
        args.push(`--conversation=${prevConversationId}`);
    }
    args.push(`--print=${promptText}`);
    await onLog("stdout", `[antigravity] Starting agy session (agent: ${agent.name}, model: ${model}, conversation: ${conversationId})...\n`);
    try {
        const processResult = await runChildProcess(runId, command, args, {
            cwd: effectiveCwd,
            env,
            timeoutSec,
            graceSec,
            onLog: async (stream, chunk) => {
                await onLog(stream, chunk);
            },
            onSpawn: ctx.onSpawn,
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
                cwd: effectiveCwd,
                model,
                agentId: agent.id,
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
