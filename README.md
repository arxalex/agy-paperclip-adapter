# Antigravity Paperclip Adapter (`agy-paperclip-adapter`)

An external adapter plugin for [Paperclip](https://github.com/paperclipai/paperclip) that integrates the Google Antigravity (`agy`) CLI agent runtime.

## Features

- **Full Model Support**: Supports all Antigravity models (`gemini-3.8-flash-high`, `gemini-3.7-flash-high`, `gemini-3.1-pro-high`, `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`, `auto`).
- **Session Continuity**: Retains `--conversation` state across Paperclip heartbeat runs.
- **Configurable Reasoning Effort**: Low, Medium, High, and Max thinking modes.
- **Declarative Schema**: Exposes models and settings directly in Paperclip's web UI.
- **UI Transcript Parser**: Native streaming output parser for tool calls, reasoning steps, and assistant text.

## Installation into Paperclip

Install as a local adapter plugin:

```bash
paperclipai adapter install --payload-json '{"packageName":"/root/agy-paperclip-adapter","isLocalPath":true}'
```

Or via API:

```bash
curl -X POST http://localhost:3100/api/adapters/install \
  -H "Authorization: Bearer <PAPERCLIP_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"packageName":"/root/agy-paperclip-adapter","isLocalPath":true}'
```

## Build

```bash
npm run build
```
