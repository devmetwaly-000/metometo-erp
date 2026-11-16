$appDir = "D:\MultiBranch_Account\AccountingNewteps-main"

Write-Host "Stopping MultiBranch POS service..." -ForegroundColor Yellow

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

Write-Host "Service stopped successfully." -ForegroundColor Green
