# Sidecar Cocktail — CLAUDE.md

AI Coding Activity Monitor. Tauri v2 + React 19 + Rust + SQLite + Gemini/Claude API.

## Development

```powershell
# Build temp on D drive (C: is limited)
$env:CARGO_TARGET_DIR = "D:\cargo-tmp"

# Dev server
npm run tauri dev

# Frontend tests
npm test
npm run test:watch    # watch mode

# Rust tests
cd src-tauri
cargo test
```

## Project structure

```
src/                    React frontend (TypeScript)
  components/           UI components by domain
  hooks/                useEventStream, useFileStream, useAnalysisStream, useSettings
  stores/appStore.ts    Zustand state
  types/index.ts        Shared TypeScript types
  test/                 Vitest tests
src-tauri/src/          Rust backend
  ai/                   Gemini + Claude API, redactor, prompts
  commands/             Tauri commands (sessions, files, analysis, export, config)
  correlation/          PreToolUse→file-change correlation engine
  db/                   SQLite schema & migrations
  events/               Hook payload parsing, risk scoring
  git/                  git diff integration
  ipc/                  Axum HTTP server (port 7878)
  watcher/              notify filesystem watcher (multi-path, stoppable)
hooks/                  Claude Code hook scripts
```

## Hook wiring (Claude Code integration)

See `hooks/INSTALL.md` for full instructions.

**Quick setup — PowerShell:**
```powershell
# Copy hooks to Claude Code settings
$dest = "$env:USERPROFILE\.claude\hooks"
New-Item -ItemType Directory -Force $dest
Copy-Item hooks\dispatcher.ps1 $dest\
```

**hooks/settings.json** (merge into `~/.claude/settings.json`):
```json
{
  "hooks": {
    "PreToolUse":         [{ "type": "command", "command": "powershell -File ~/.claude/hooks/dispatcher.ps1" }],
    "PostToolUse":        [{ "type": "command", "command": "powershell -File ~/.claude/hooks/dispatcher.ps1" }],
    "PostToolUseFailure": [{ "type": "command", "command": "powershell -File ~/.claude/hooks/dispatcher.ps1" }],
    "PermissionRequest":  [{ "type": "command", "command": "powershell -File ~/.claude/hooks/dispatcher.ps1" }],
    "Stop":               [{ "type": "command", "command": "powershell -File ~/.claude/hooks/dispatcher.ps1" }]
  }
}
```

## Data flow

```
Claude Code hook → dispatcher.ps1 → POST localhost:7878/event
                                         ↓
                              ipc::handle_event()
                                  ├── correlation engine
                                  ├── persist to SQLite
                                  ├── emit sidecar://event (frontend)
                                  ├── push OS notification (High/Critical)
                                  └── auto-analyze (High/Critical + API key)
                                         ↓
                              ai::analyze() → Gemini/Claude API
                                  ├── secret redaction
                                  ├── persist analysis
                                  └── emit sidecar://analysis (frontend)

notify watcher → watcher::process_change()
                    ├── git diff
                    ├── correlation score
                    ├── persist file_change
                    └── emit sidecar://file-change (frontend)
```

## Database (SQLite WAL)

Tables: `sessions`, `events`, `file_changes`, `analyses`, `bookmarks`, `settings`, `watch_paths`

Location: `%APPDATA%\com.sidecar-cocktail.app\sidecar.db`

## IPC endpoint

`POST http://127.0.0.1:7878/event` — JSON body matching `HookPayload`  
`GET  http://127.0.0.1:7878/health` — returns `{"ok":true,"port":7878}`
