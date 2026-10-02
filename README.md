# Antigravity Paperclip Adapter (`agy-paperclip-adapter`)

An external adapter plugin for [Paperclip](https://github.com/paperclipai/paperclip) that integrates the Google Antigravity (`agy`) local CLI agent runtime.

## Features

- **Full Model Selection**: Supports all Antigravity models (`gemini-3.8-flash-high`, `gemini-3.7-flash-high`, `gemini-3.6-flash-high`, `gemini-3.1-pro-high`, `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`, `auto`).
- **Adapter Icon**: Includes native SVG branding icon for Paperclip's UI.
- **Paperclip Skills to AGY Sync**: Automatically materializes skills assigned in Paperclip into `${workspace}/.agents/skills/<skill-name>/SKILL.md` for AGY agent discovery.
- **Multi-Agent Isolation**: Allows hiring multiple agents with distinct roles, instructions, and skills on a single local `agy` runtime via isolated conversation sessions (`--conversation`) and working directories.
- **UI Transcript Parser**: Self-contained streaming parser for tool calls, thinking steps, system logs, and assistant markdown output.
- **Package Import Ready (`npm run pack`)**: Easily build and package into `dist/agy-paperclip-adapter-1.0.0.tgz` for importing via Paperclip UI or CLI.

## Quick Start & Packing

To build and generate the importable tarball in `dist/`:

```bash
npm run pack
# Output: dist/agy-paperclip-adapter-1.0.0.tgz
```

## Installation into Paperclip

### Option 1: Via UI (Custom Adapter Import)
Upload `dist/agy-paperclip-adapter-1.0.0.tgz` in the Paperclip UI under **Settings → Adapters → Install Custom Adapter**.

### Option 2: Via Paperclip CLI
```bash
paperclipai adapter install --payload-json "{\"packageName\":\"$PWD/dist/agy-paperclip-adapter-1.0.0.tgz\"}"
```

### Option 3: Local Symlink Development
```bash
curl -X POST http://localhost:3100/api/adapters \
  -H "Authorization: Bearer <PAPERCLIP_API_KEY>" \
  -H "Content-Type: application/json" \
  -d "{\"localPath\":\"$PWD\"}"
```

## License

MIT
