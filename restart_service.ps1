$appDir = "D:\MultiBranch_Account\AccountingNewteps-main"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "     Restarting MultiBranch POS System    " -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Stop current processes
Write-Host "[1/3] Stopping running processes..." -ForegroundColor White

$conns = Get-NetTCPConnection -LocalPort 9002 -ErrorAction SilentlyContinue
if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
        if ($p -and $p -ne 0) {
            try {
                Stop-Process -Id $p -Force -ErrorAction Stop
                Write-Host "  Terminated process PID: $p" -ForegroundColor Green
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

# 2. Start the updated service
Write-Host "[2/3] Starting updated service..." -ForegroundColor White
$vbsScript = Join-Path $appDir "scripts\service\start_service_silent.vbs"
Start-Process "wscript.exe" -ArgumentList "`"$vbsScript`"" -WorkingDirectory $appDir

# 3. Wait for port 9002
Write-Host "[3/3] Waiting for service on port 9002..." -ForegroundColor White
$ready = $false
for ($i = 0; $i -lt 35; $i++) {
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
    Write-Host "Service started successfully! Opening POS..." -ForegroundColor Green
    Start-Process "http://localhost:9002/pos"
}
else {
    Write-Host "Service is launching, opening browser..." -ForegroundColor Yellow
    Start-Process "http://localhost:9002/pos"
}
