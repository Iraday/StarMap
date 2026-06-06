#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$repoRoot     = $PSScriptRoot
$referenceDir = Join-Path $repoRoot "reference"
$folderName   = [System.Text.Encoding]::UTF8.GetString([byte[]](0xE5,0xA4,0xAA,0xE7,0xA9,0xBA,0xE6,0x96,0x87,0xE6,0x98,0x8E,0xE7,0xA7,0x91,0xE6,0x8A,0x80,0xE6,0xA0,0x91))
$targetDir    = Join-Path $referenceDir $folderName
$workflowBat  = "D:\Python\excel_to_md\run_workflow.bat"
$sourceDir    = Join-Path "D:\Python\excel_to_md\output" $folderName

function Write-Step {
    param([int]$Step, [int]$Total, [string]$Status, [string]$Detail = "")
    $pct = [int](($Step / $Total) * 100)
    Write-Progress -Activity "Update Reference" -Status "[$Step/$Total] $Status" -PercentComplete $pct -CurrentOperation $Detail
    Write-Host "[Step $Step/$Total] $Status" -ForegroundColor Cyan
    if ($Detail) { Write-Host "  $Detail" -ForegroundColor Gray }
}

function Fail {
    param([string]$Msg)
    Write-Progress -Activity "Update Reference" -Completed
    Write-Host ""
    Write-Host "ERROR: $Msg" -ForegroundColor Red
    exit 1
}

$totalSteps = 4

# Step 1: Ensure reference folder exists
Write-Step 1 $totalSteps "Checking reference folder..."
try {
    if (-not (Test-Path $referenceDir)) {
        New-Item -ItemType Directory -Path $referenceDir | Out-Null
        Write-Host "  Created: .\reference" -ForegroundColor Yellow
    } else {
        Write-Host "  Found:   .\reference" -ForegroundColor Green
    }
} catch {
    Fail "Could not create reference folder: $_"
}

# Step 2: Verify workflow bat exists
Write-Step 2 $totalSteps "Verifying workflow script..." $workflowBat
if (-not (Test-Path $workflowBat)) {
    Fail "Workflow script not found: $workflowBat"
}

# Step 3: Run workflow and wait (0<nul bypasses any pause prompts automatically)
Write-Step 3 $totalSteps "Running excel_to_md workflow (this may take a while)..." $workflowBat
Write-Host ""
Write-Host "-----------------------------------------------------" -ForegroundColor DarkGray
try {
    $proc = Start-Process -FilePath "cmd.exe" `
                          -ArgumentList "/c `"$workflowBat`" 0<nul" `
                          -WorkingDirectory (Split-Path $workflowBat) `
                          -NoNewWindow `
                          -PassThru `
                          -Wait
    Write-Host "-----------------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
    if ($proc.ExitCode -ne 0) {
        Fail "Workflow exited with code $($proc.ExitCode). Check output above for details."
    }
    Write-Host "  Workflow completed successfully (exit code 0)." -ForegroundColor Green
} catch {
    Fail "Failed to run workflow: $_"
}

# Step 4: Copy output to reference
Write-Step 4 $totalSteps "Copying output to reference folder..."

if (-not (Test-Path $sourceDir)) {
    Fail "Expected output folder not found after workflow: $sourceDir"
}

try {
    $files = Get-ChildItem -Path $sourceDir -Recurse -File
    $total = $files.Count
    $i = 0

    Write-Host "  Source: excel_to_md\output\$folderName" -ForegroundColor Gray
    Write-Host "  Target: .\reference\$folderName" -ForegroundColor Gray
    Write-Host "  Files:  $total" -ForegroundColor Gray
    Write-Host ""

    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir | Out-Null
    }

    foreach ($file in $files) {
        $i++
        $pct = [int](($i / [Math]::Max($total, 1)) * 100)
        $relative = $file.FullName.Substring($sourceDir.Length).TrimStart('\','/')
        Write-Progress -Activity "Copying files" -Status "$i / $total ($pct pct)" -PercentComplete $pct -CurrentOperation $relative

        $dest = Join-Path $targetDir $relative
        $destFolder = Split-Path $dest -Parent
        if (-not (Test-Path $destFolder)) {
            New-Item -ItemType Directory -Path $destFolder | Out-Null
        }
        Copy-Item -Path $file.FullName -Destination $dest -Force
    }

    Write-Progress -Activity "Copying files" -Completed
    Write-Host "  Copied $total file(s) successfully." -ForegroundColor Green

} catch {
    Fail "Copy failed: $_"
}

# Done
Write-Progress -Activity "Update Reference" -Completed
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  All done! reference folder is up to date." -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host ""