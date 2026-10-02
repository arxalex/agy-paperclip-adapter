import fs from "node:fs/promises";
import crypto from "node:crypto";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  runChildProcess,
  buildPaperclipEnv,
  applyPaperclipWorkspaceEnv,
  renderPaperclipWakePrompt,
  renderTemplate,
  joinPromptSections,
  stringifyPaperclipWakePayload,
  parseObject,
  asString,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_ANTIGRAVITY_MODEL } from "../models.js";

function buildPrompt(ctx: AdapterExecutionContext): string {
  const { config, agent, context } = ctx;

  const wakePrompt = renderPaperclipWakePrompt(context?.paperclipWake, {
    conversationMode: context?.conversationMode === true,
    resumedSession: Boolean(ctx.runtime?.sessionId),
    suppressIssueDescription: false,
  });

  const template =
    typeof config.promptTemplate === "string" && config.promptTemplate.trim().length > 0
      ? config.promptTemplate
      : DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE;

  const data: Record<string, unknown> = {
    agentId: agent.id,
    agentName: agent.name,
    companyId: agent.companyId,
    runId: ctx.runId,
    taskId: context?.taskId ?? "",
    taskTitle: context?.taskTitle ?? "",
    wakeReason: context?.wakeReason ?? "",
  };

  const renderedTemplate = renderTemplate(template, data);

  let taskDetails = "";
  if (typeof context?.taskDescription === "string" && context.taskDescription.trim().length > 0) {
    taskDetails = `## Task Details\n${context.taskDescription}`;
  }

  if (wakePrompt && wakePrompt.trim().length > 0) {
    return joinPromptSections([wakePrompt, renderedTemplate, taskDetails]);
  }

  return joinPromptSections([renderedTemplate, taskDetails]);
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { config, agent, runId, onLog, context } = ctx;

  const command = String(config.command ?? "agy");
  const model = String(config.model ?? DEFAULT_ANTIGRAVITY_MODEL);
  const effort = config.effort ? String(config.effort) : null;
  const mode = config.mode ? String(config.mode) : null;
  const timeoutSec = Number(config.timeoutSec ?? 600);
  const graceSec = Number(config.graceSec ?? 15);

  // Maintain conversation session
  const prevConversationId =
    typeof ctx.runtime?.sessionParams?.conversationId === "string"
      ? ctx.runtime.sessionParams.conversationId
      : typeof ctx.runtime?.sessionId === "string"
        ? ctx.runtime.sessionId
        : null;
  const conversationId = prevConversationId ?? crypto.randomUUID();

  // Resolve workspace & cwd
  const workspaceContext = parseObject(context?.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const effectiveCwd = workspaceCwd || String(config.cwd ?? process.cwd());

  // Ensure workspace directory exists
  try {
    await fs.mkdir(effectiveCwd, { recursive: true });
  } catch {
    // Ignore error
  }

  // Build Paperclip env
  const paperclipEnv = buildPaperclipEnv(agent);
  const env: Record<string, string> = {
    ...process.env,
    ...paperclipEnv,
    HOME: process.env.HOME || "/root",
    PATH: `/root/.local/bin:${process.env.PATH ?? ""}`,
    PAPERCLIP_RUN_ID: runId,
  };

  // Inject authentication token
  if (ctx.authToken) {
    env.PAPERCLIP_API_KEY = ctx.authToken;
  }

  // Inject wake and task context
  const wakeTaskId =
    (typeof context?.taskId === "string" && context.taskId.trim()) ||
    (typeof context?.issueId === "string" && context.issueId.trim()) ||
    null;
  if (wakeTaskId) {
    env.PAPERCLIP_TASK_ID = wakeTaskId;
  }
  const wakeReason =
    typeof context?.wakeReason === "string" && context.wakeReason.trim()
      ? context.wakeReason.trim()
      : null;
  if (wakeReason) {
    env.PAPERCLIP_WAKE_REASON = wakeReason;
  }
  const wakeCommentId =
    (typeof context?.wakeCommentId === "string" && context.wakeCommentId.trim()) ||
    (typeof context?.commentId === "string" && context.commentId.trim()) ||
    null;
  if (wakeCommentId) {
    env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  }
  const approvalId =
    typeof context?.approvalId === "string" && context.approvalId.trim()
      ? context.approvalId.trim()
      : null;
  if (approvalId) {
    env.PAPERCLIP_APPROVAL_ID = approvalId;
  }
  const approvalStatus =
    typeof context?.approvalStatus === "string" && context.approvalStatus.trim()
      ? context.approvalStatus.trim()
      : null;
  if (approvalStatus) {
    env.PAPERCLIP_APPROVAL_STATUS = approvalStatus;
  }
  const linkedIssueIds = Array.isArray(context?.issueIds)
    ? context.issueIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  if (linkedIssueIds.length > 0) {
    env.PAPERCLIP_LINKED_ISSUE_IDS = linkedIssueIds.join(",");
  }
  const wakePayloadJson = stringifyPaperclipWakePayload(context?.paperclipWake);
  if (wakePayloadJson) {
    env.PAPERCLIP_WAKE_PAYLOAD_JSON = wakePayloadJson;
  }

  // Apply workspace environment
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

  // Add custom env vars from config if present
  if (typeof config.env === "object" && config.env !== null) {
    for (const [k, v] of Object.entries(config.env)) {
      if (typeof v === "string") env[k] = v;
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
    } catch {
      // Ignore missing instructions file
    }
  }

  // Build agy arguments: put all options first, and attach prompt to --print
  const args: string[] = ["--dangerously-skip-permissions"];

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

  await onLog("stdout", `[antigravity] Starting agy session (model: ${model}, conversation: ${conversationId})...\n`);

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
      },
      errorMessage: isSuccess ? null : `agy exited with code ${processResult.exitCode}`,
      summary: isSuccess ? "Completed Antigravity run" : `Run failed with exit code ${processResult.exitCode}`,
    };
  } catch (err) {
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
