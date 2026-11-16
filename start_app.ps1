$appDir = "D:\MultiBranch_Account\AccountingNewteps-main"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "       Starting MultiBranch POS System    " -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

# Check SQL Server
try {
    $sqlSvc = Get-Service -Name "MSSQLSERVER" -ErrorAction SilentlyContinue
    if ($sqlSvc -and $sqlSvc.Status -ne "Running") {
        Write-Host "Starting SQL Server service..." -ForegroundColor Yellow
        Start-Service -Name "MSSQLSERVER" -ErrorAction SilentlyContinue
    }
}
catch {}

# Start service
Write-Host "Launching service in background..." -ForegroundColor White
$vbsScript = Join-Path $appDir "scripts\service\start_service_silent.vbs"
Start-Process "wscript.exe" -ArgumentList "`"$vbsScript`"" -WorkingDirectory $appDir

# Wait for port 9002
Write-Host "Waiting for service on port 9002..." -ForegroundColor White
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
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
    Write-Host "Service is ready! Opening application..." -ForegroundColor Green
    Start-Process "http://localhost:9002/pos"
}
else {
    Write-Host "Opening application in browser..." -ForegroundColor Yellow
    Start-Process "http://localhost:9002/pos"
}
