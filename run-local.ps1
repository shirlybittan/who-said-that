$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$clientDir = Join-Path $repoRoot "client"
$serverEntry = Join-Path $repoRoot "server\index.js"

if (!(Test-Path $clientDir)) {
    Write-Error "Client directory not found: $clientDir"
    exit 1
}

if (!(Test-Path $serverEntry)) {
    Write-Error "Server entry not found: $serverEntry"
    exit 1
}

# Free client/server ports when re-running this script.
$portsToFree = @(3001, 5173)
foreach ($port in $portsToFree) {
    $pidsToCheck = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)

    foreach ($processId in $pidsToCheck) {
        if ($processId) {
            Write-Host "Port $port in use by PID $processId. Stopping it..."
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
}

Start-Job -ScriptBlock {
    param($dir)
    npm --prefix $dir run dev -- --port 5173 --strictPort
} -ArgumentList $clientDir | Out-Null

Write-Host "Client starting in background at http://localhost:5173 ..."
Write-Host "Server starting on foreground..."
Write-Host "Open app: http://localhost:5173"

node $serverEntry