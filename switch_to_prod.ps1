$appDir = "D:\MultiBranch_Account\AccountingNewteps-main"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "    Switching to Production Mode (PROD)   " -ForegroundColor Yellow
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

# 2. Check if already built or rebuild
$buildIdFile = Join-Path $appDir ".next\BUILD_ID"
if (-not (Test-Path $buildIdFile)) {
    Write-Host "[2/4] Building production assets (npm run build)..." -ForegroundColor White
    Push-Location $appDir
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Build failed with code $LASTEXITCODE" -ForegroundColor Red
            Pop-Location
            exit $LASTEXITCODE
        }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "[2/4] Production build is ready (BUILD_ID verified)." -ForegroundColor Green
}

# 3. Start production service
Write-Host "[3/4] Launching server in Production mode..." -ForegroundColor White
$vbsScript = Join-Path $appDir "scripts\service\start_service_silent.vbs"
Start-Process "wscript.exe" -ArgumentList "`"$vbsScript`"" -WorkingDirectory $appDir

# 4. Wait for port 9002
Write-Host "[4/4] Waiting for production server on port 9002..." -ForegroundColor White
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
    Write-Host "`nServer ready in Production mode! Opening POS..." -ForegroundColor Green
    Start-Process "http://localhost:9002/pos"
}
else {
    Write-Host "`nProduction server is starting, opening browser..." -ForegroundColor Yellow
    Start-Process "http://localhost:9002/pos"
}
