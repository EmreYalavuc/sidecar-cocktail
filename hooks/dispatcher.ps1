# Sidecar hook dispatcher for Claude Code (Windows)
# Reads event JSON from stdin, POSTs to Sidecar IPC server.
# FAIL-OPEN: exits 0 in all cases, never blocks Claude Code.

param()

$ErrorActionPreference = "SilentlyContinue"

try {
    $body = $input | Out-String
    if ([string]::IsNullOrWhiteSpace($body)) { exit 0 }

    $null = Invoke-WebRequest `
        -Uri         "http://127.0.0.1:7878/event" `
        -Method      POST `
        -Body        $body `
        -ContentType "application/json" `
        -TimeoutSec  0.09 `
        -UseBasicParsing `
        -ErrorAction SilentlyContinue
} catch {
    # Intentionally swallowed — Sidecar may not be running
}

exit 0
