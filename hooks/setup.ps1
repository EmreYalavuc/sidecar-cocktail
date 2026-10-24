# Sidecar Cocktail — One-time hook setup script
# Run once per machine: powershell -ExecutionPolicy Bypass -File setup.ps1
# Copies dispatcher.ps1 to ~/.claude/hooks/ and writes the correct absolute
# path into ~/.claude/settings.json so Claude Code can find it on any PC.

$ErrorActionPreference = "Stop"

# --- 1. Copy dispatcher to ~/.claude/hooks/ ------------------------------------
$hookDir    = Join-Path $env:USERPROFILE ".claude\hooks"
$dispatcher = Join-Path $hookDir "dispatcher.ps1"
$scriptDir  = Split-Path $MyInvocation.MyCommand.Path -Parent

New-Item -ItemType Directory -Force $hookDir | Out-Null
Copy-Item (Join-Path $scriptDir "dispatcher.ps1") $dispatcher -Force
Write-Host "Dispatcher copied to: $dispatcher"

# --- 2. Build hook command with absolute path ----------------------------------
# Hardcoded absolute path avoids all variable-expansion issues across different
# Claude Code invocation methods (cmd.exe, CreateProcess, etc.)
$hookCmd = "powershell -NonInteractive -File `"$dispatcher`""

$hookBlock = @{
    matcher = ".*"
    hooks   = @(@{ type = "command"; command = $hookCmd })
}

# --- 3. Merge into ~/.claude/settings.json ------------------------------------
$settingsPath = Join-Path $env:USERPROFILE ".claude\settings.json"

$settings = if (Test-Path $settingsPath) {
    Get-Content $settingsPath -Raw | ConvertFrom-Json
} else {
    [PSCustomObject]@{}
}

# Ensure hooks key exists
if (-not $settings.PSObject.Properties["hooks"]) {
    $settings | Add-Member -NotePropertyName "hooks" -NotePropertyValue ([PSCustomObject]@{})
}

foreach ($evt in @("PreToolUse","PostToolUse","PostToolUseFailure","Stop")) {
    $settings.hooks | Add-Member -NotePropertyName $evt -NotePropertyValue @($hookBlock) -Force
}

$settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding utf8
Write-Host "settings.json updated: $settingsPath"
Write-Host ""
Write-Host "Done. Restart Claude Code to activate hooks."
