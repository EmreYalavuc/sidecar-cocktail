# Sidecar Hook Setup

Claude Code hooks'larını Sidecar'a bağlamak için:

## Windows (PowerShell)

Claude Code → Settings → Hooks → her event için:

```
powershell -ExecutionPolicy Bypass -File "C:\Users\Pc\Desktop\projeler\Sidecar Coctail\hooks\dispatcher.ps1"
```

## Claude Code settings.json (manuel)

`~/.claude/settings.json` dosyasına ekle:

```json
{
  "hooks": {
    "PreToolUse":        [{ "hooks": [{ "type": "command", "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\Pc\\Desktop\\projeler\\Sidecar Coctail\\hooks\\dispatcher.ps1\"" }] }],
    "PostToolUse":       [{ "hooks": [{ "type": "command", "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\Pc\\Desktop\\projeler\\Sidecar Coctail\\hooks\\dispatcher.ps1\"" }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\Pc\\Desktop\\projeler\\Sidecar Coctail\\hooks\\dispatcher.ps1\"" }] }],
    "SessionStart":      [{ "hooks": [{ "type": "command", "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\Pc\\Desktop\\projeler\\Sidecar Coctail\\hooks\\dispatcher.ps1\"" }] }],
    "SessionEnd":        [{ "hooks": [{ "type": "command", "command": "powershell -ExecutionPolicy Bypass -File \"C:\\Users\\Pc\\Desktop\\projeler\\Sidecar Coctail\\hooks\\dispatcher.ps1\"" }] }]
  }
}
```

Sidecar çalışmıyorsa dispatcher 90ms'de timeout verip çıkar — Claude Code etkilenmez.
