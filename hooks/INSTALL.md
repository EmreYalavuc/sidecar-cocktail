# Sidecar Hook Installation Guide

This guide wires **Sidecar Cocktail** into Claude Code so every tool call is monitored.

## Prerequisites

- Sidecar Cocktail app running (starts IPC server on port 7878)
- Claude Code installed

## Step 1 — Copy the dispatcher

```powershell
# Create hooks directory
$dest = "$env:USERPROFILE\.claude\hooks"
New-Item -ItemType Directory -Force $dest

# Copy dispatcher
Copy-Item "$PSScriptRoot\dispatcher.ps1" $dest\
```

## Step 2 — Register hooks in Claude Code settings

Open `~/.claude/settings.json` (create if it doesn't exist) and add:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "powershell -NonInteractive -File \"%USERPROFILE%\\.claude\\hooks\\dispatcher.ps1\""
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "powershell -NonInteractive -File \"%USERPROFILE%\\.claude\\hooks\\dispatcher.ps1\""
      }
    ],
    "PostToolUseFailure": [
      {
        "type": "command",
        "command": "powershell -NonInteractive -File \"%USERPROFILE%\\.claude\\hooks\\dispatcher.ps1\""
      }
    ],
    "PermissionRequest": [
      {
        "type": "command",
        "command": "powershell -NonInteractive -File \"%USERPROFILE%\\.claude\\hooks\\dispatcher.ps1\""
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "powershell -NonInteractive -File \"%USERPROFILE%\\.claude\\hooks\\dispatcher.ps1\""
      }
    ]
  }
}
```

## Step 3 — Verify

1. Start Sidecar Cocktail
2. Open Claude Code in any project
3. Run any tool (e.g. read a file)
4. Check the Sidecar Timeline view — you should see the event appear

The IPC indicator in Sidecar's header turns green when connected.

## How it works

`dispatcher.ps1` reads the JSON payload Claude Code writes to stdin and POSTs it to `http://127.0.0.1:7878/event`. It exits within 90ms regardless of app state (fail-open design — Claude Code never blocks waiting for Sidecar).

## Custom port

If you changed the IPC port in Sidecar Settings, update the dispatcher URL too:

```powershell
# dispatcher.ps1 — change this line:
$url = "http://127.0.0.1:YOUR_PORT/event"
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| No events appear | Check Sidecar is running and IPC indicator is green |
| Red IPC dot | App is running but IPC server failed; restart Sidecar |
| Hooks slow down Claude Code | Shouldn't happen; dispatcher has 90ms timeout and exits 0 always |
| Events missing hook data | Ensure `dispatcher.ps1` path has no spaces, or wrap in quotes |
