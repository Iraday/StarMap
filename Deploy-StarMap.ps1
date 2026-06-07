<#
.SYNOPSIS
Deploys StarMap to a remote server.
#>

$RemoteHost = "colorcrossingNY"
$RemoteDir = "~/StarMap"
$ZipName = "starmap_deploy.zip"
$LocalZipPath = "$env:TEMP\$ZipName"

Write-Host "Packaging StarMap files..." -ForegroundColor Cyan

# Remove old zip if it exists
if (Test-Path $LocalZipPath) { Remove-Item $LocalZipPath -Force }

# Use tar to create zip, excluding unnecessary directories
tar.exe -a -c -f $LocalZipPath --exclude .venv --exclude .git --exclude __pycache__ --exclude backup --exclude saves --exclude .claude *

if (-not (Test-Path $LocalZipPath)) {
    Write-Host "Failed to create deployment archive." -ForegroundColor Red
    exit 1
}

Write-Host "Uploading to $RemoteHost..." -ForegroundColor Cyan
scp $LocalZipPath "$($RemoteHost):~/$ZipName"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload files to remote server." -ForegroundColor Red
    exit 1
}

Write-Host "Extracting and restarting service on $RemoteHost..." -ForegroundColor Cyan
$RemoteCommands = @"
mkdir -p $RemoteDir
unzip -o ~/$ZipName -d $RemoteDir
rm ~/$ZipName
sed -i 's/127.0.0.1/0.0.0.0/g' $RemoteDir/server.py
pkill -f 'python3 server.py' || true
cd $RemoteDir
tmux kill-session -t starmap 2>/dev/null || true
sleep 2
tmux new-session -d -c $RemoteDir -s starmap 'python3 server.py'
echo 'Deployment successful! Server restarted and listening on port 8765.'
"@ -replace "`r`n", "`n"

ssh $RemoteHost $RemoteCommands

Write-Host "Cleaning up local temporary files..." -ForegroundColor Cyan
Remove-Item $LocalZipPath -Force

Write-Host "Deployment Completed Successfully!" -ForegroundColor Green
