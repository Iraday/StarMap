param(
  [int]$Port = 8765,
  [switch]$NoOpen,
  [switch]$RebuildDb
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Stop-OldStarMap {
  Write-Host "Checking for old StarMap server processes..." -ForegroundColor DarkCyan
  try {
    $escapedRoot = [Regex]::Escape($Root)
    $oldProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match "server\.py" -and $_.CommandLine -match $escapedRoot }
    foreach ($proc in $oldProcesses) {
      Write-Host "Stopping old StarMap process PID $($proc.ProcessId)" -ForegroundColor DarkYellow
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }
  } catch {
    Write-Host "Could not inspect old StarMap processes: $($_.Exception.Message)" -ForegroundColor DarkYellow
  }

  try {
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
      Write-Host "Stopping process PID $($listener.OwningProcess) on port $Port" -ForegroundColor DarkYellow
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  } catch {
    Write-Host "Could not inspect port $Port listeners: $($_.Exception.Message)" -ForegroundColor DarkYellow
  }
  Start-Sleep -Milliseconds 300
}

function Find-Python {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) { return $python.Source }

  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) { return $py.Source }

  throw "Python 3 is required. Install it from https://www.python.org/downloads/windows/ and rerun this script."
}

function Test-PortOpen([int]$Candidate) {
  $conn = Get-NetTCPConnection -LocalPort $Candidate -State Listen -ErrorAction SilentlyContinue
  return $null -eq $conn
}

Stop-OldStarMap

$SystemPython = Find-Python
$VenvDir = ".venv"

if (-not (Test-Path "$VenvDir\Scripts\python.exe")) {
    Write-Host "Virtual environment not found. Setting it up..." -ForegroundColor Cyan
    & $SystemPython -m venv $VenvDir
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create virtual environment."
    }
}

$Python = "$Root\$VenvDir\Scripts\python.exe"

if (Test-Path "requirements.txt") {
    & $Python -m pip install -r requirements.txt
}

while (-not (Test-PortOpen $Port)) {
  $Port += 1
}

function Get-DbUserVersion([string]$DbPath) {
  if (-not (Test-Path -LiteralPath $DbPath)) { return -1 }
  $raw = & $Python -c "import sqlite3, sys; con=sqlite3.connect(sys.argv[1]); print(con.execute('PRAGMA user_version').fetchone()[0])" $DbPath
  if ($LASTEXITCODE -ne 0) { return -1 }
  return [int]$raw
}

$SchemaVersion = [int](& $Python -c "from scripts.init_db import SCHEMA_VERSION; print(SCHEMA_VERSION)")
$DbVersion = Get-DbUserVersion "data\stars.sqlite"

if ($RebuildDb -or -not (Test-Path -LiteralPath "data\stars.sqlite")) {
  & $Python "scripts\init_db.py" "--force" "--db" "data\stars.sqlite"
} elseif ($DbVersion -lt $SchemaVersion) {
  Write-Host "SQLite schema v$DbVersion is older than v$SchemaVersion. Migrating/reseeding..." -ForegroundColor Cyan
  & $Python "scripts\init_db.py" "--db" "data\stars.sqlite"
} else {
  Write-Host "Using existing SQLite database v$DbVersion." -ForegroundColor DarkCyan
}

$Url = "http://127.0.0.1:$Port/"
Write-Host ""
Write-Host "StarMap is starting..." -ForegroundColor Cyan
Write-Host "Open this URL in your browser:" -ForegroundColor Green
Write-Host $Url -ForegroundColor Yellow
Write-Host ""
Write-Host "Agent/API examples:"
Write-Host "  ${Url}api/distance?from=gj1002&to=teegarden"
Write-Host "  ${Url}api/nearest?from=li-hartman&limit=5"
Write-Host "  ${Url}api/zoom-target?star=GJ%201002"
Write-Host "  ${Url}api/stars?class=M&minPlanets=3&includeOuter=1"
Write-Host "  ${Url}api/system?id=li-hartman"
Write-Host ""
Write-Host "Press Ctrl+C in this window to stop the server."
Write-Host ""

if (-not $NoOpen) {
  Start-Process $Url
}

& $Python "server.py" "$Port"
