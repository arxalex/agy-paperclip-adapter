// Self-contained UI transcript parser for Antigravity (zero runtime imports)
export function parseStdoutLine(line, ts) {
    const trimmed = line.trim();
    if (!trimmed)
        return [];
    // Antigravity adapter log messages
    if (trimmed.startsWith("[antigravity]")) {
        return [{ kind: "system", ts, text: trimmed }];
    }
    // Spinner / progress indicators from CLI
    if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(trimmed)) {
        return [{ kind: "thinking", ts, text: trimmed.replace(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*/, "") }];
    }
    // Thinking markers
    if (trimmed.startsWith("Thinking:") || trimmed.startsWith("Thought:")) {
        return [{ kind: "thinking", ts, text: trimmed }];
    }
    // Tool calls (e.g. [tool] call: name)
    const toolMatch = trimmed.match(/^\[(?:tool|call)\]\s+([a-zA-Z0-9_-]+)(?:\s+(.*))?$/);
    if (toolMatch) {
        const name = toolMatch[1];
        let input = {};
        if (toolMatch[2]) {
            try {
                input = JSON.parse(toolMatch[2]);
            }
            catch {
                input = { raw: toolMatch[2] };
            }
        }
        return [
            {
                kind: "tool_call",
                ts,
                name,
                input,
            },
        ];
    }
    // Default to assistant output
    return [{ kind: "assistant", ts, text: line }];
}
