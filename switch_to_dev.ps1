$appDir = "D:\MultiBranch_Account\AccountingNewteps-main"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Switching to Development Mode (DEV)    " -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Stop current processes
Write-Host "[1/4] Stopping running server..." -ForegroundColor White

$conns = Get-NetTCPConnection -LocalPort 9002 -ErrorAction SilentlyContinue
if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
        if ($p -and $p -ne 0) {
            try {
                Stop-Process -Id $p -Force -ErrorAction Stop
                Write-Host "  Terminated PID: $p" -ForegroundColor Green
            }
            catch {
                & taskkill /PID $p /F /T 2>$null
            }
        }
    }
}

# Stop daemon if running
$lockFile = Join-Path $appDir "logs\pos_service_daemon.lock"
$pidFile = Join-Path $appDir "logs\pos_service.pid"
if (Test-Path $lockFile) {
    try {
        $lockData = Get-Content $lockFile | ConvertFrom-Json
        if ($lockData.daemonPid) {
            Stop-Process -Id $lockData.daemonPid -Force -ErrorAction SilentlyContinue
            & taskkill /PID $lockData.daemonPid /F /T 2>$null
        }
    }
    catch {}
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
}
if (Test-Path $pidFile) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# 2. Remove .next build directory to force dev mode
Write-Host "[2/4] Removing build cache to enable Live Dev Mode..." -ForegroundColor White
$nextDir = Join-Path $appDir ".next"
if (Test-Path $nextDir) {
    Remove-Item $nextDir -Recurse -Force -ErrorAction SilentlyContinue
}

# 3. Start development service
Write-Host "[3/4] Launching server in DEV mode..." -ForegroundColor White
$vbsScript = Join-Path $appDir "scripts\service\start_service_silent.vbs"
Start-Process "wscript.exe" -ArgumentList "`"$vbsScript`"" -WorkingDirectory $appDir

# 4. Wait for port 9002
Write-Host "[4/4] Waiting for dev server on port 9002..." -ForegroundColor White
$ready = $false
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    $check = Get-NetTCPConnection -LocalPort 9002 -State Listen -ErrorAction SilentlyContinue
    if ($check) {
        $ready = $true
        break
    }
    Write-Host "." -NoNewline -ForegroundColor Gray
}
Write-Host ""

if ($ready) {
    Write-Host "`nServer ready in DEV mode! Opening POS..." -ForegroundColor Green
    Start-Process "http://localhost:9002/pos"
}
else {
    Write-Host "`nDev server is starting, opening browser..." -ForegroundColor Yellow
    Start-Process "http://localhost:9002/pos"
}
