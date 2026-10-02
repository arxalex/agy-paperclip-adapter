export interface TranscriptEntry {
    kind: "assistant" | "thinking" | "system" | "tool_call" | "tool_result" | "stderr" | "stdout";
    ts: string;
    text?: string;
    name?: string;
    input?: unknown;
    toolUseId?: string;
    content?: string;
    isError?: boolean;
}
export declare function parseStdoutLine(line: string, ts: string): TranscriptEntry[];
