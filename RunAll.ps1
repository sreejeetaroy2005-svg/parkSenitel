# RunAll.ps1 - Comprehensive project bootstrap and launch script
# --------------------------------------------------------------
# This PowerShell script automates the full development workflow for the ParkSentinel project.
# It sets up the Python environment, installs dependencies, preprocesses the dataset,
# and launches both the FastAPI backend and the Vite/React frontend concurrently.
# --------------------------------------------------------------
# Usage:
#   1. Open PowerShell in the project root (where this script resides).
#   2. Run:   ./RunAll.ps1
# --------------------------------------------------------------

# Helper function for colored console output
function Write-Info($msg) {
    Write-Host "[INFO] $msg" -ForegroundColor Cyan
}
function Write-Success($msg) {
    Write-Host "[SUCCESS] $msg" -ForegroundColor Green
}
function Write-ErrorMsg($msg) {
    Write-Host "[ERROR] $msg" -ForegroundColor Red
}

# 1. Ensure we are in the project root
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot
Write-Info "Project root set to $projectRoot"

# 2. Python virtual environment setup
$venvPath = "$projectRoot\venv"
if (-Not (Test-Path $venvPath)) {
    Write-Info "Creating Python virtual environment…"
    python -m venv venv
    if ($LASTEXITCODE -ne 0) { Write-ErrorMsg "Failed to create venv"; exit 1 }
}
# Activate the venv
$activateScript = "$venvPath\Scripts\Activate.ps1"
if (Test-Path $activateScript) {
    Write-Info "Activating virtual environment…"
    & $activateScript
} else {
    Write-ErrorMsg "Activation script not found: $activateScript"
    exit 1
}

# 3. Install Python dependencies
if (Test-Path "requirements.txt") {
    Write-Info "Installing Python dependencies…"
    pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { Write-ErrorMsg "pip install failed"; exit 1 }
} else {
    Write-ErrorMsg "requirements.txt not found – skipping Python deps"
}

# 4. Preprocess data (adjust path if needed)
$datasetPath = "C:\Users\SREEJEETA\OneDrive\Desktop\flipkart_gridlock\data\jan to may police violation_anonymized791b166.csv"
if (Test-Path $datasetPath) {
    Write-Info "Running data preprocessing…"
    python preprocess.py "$datasetPath"
    if ($LASTEXITCODE -ne 0) { Write-ErrorMsg "preprocess failed"; exit 1 }
} else {
    Write-ErrorMsg "Dataset not found at $datasetPath – skipping preprocessing"
}

# 5. Install Node dependencies (frontend)
$frontendDir = "$projectRoot\frontend"
if (Test-Path $frontendDir) {
    Set-Location $frontendDir
    Write-Info "Installing Node dependencies…"
    npm ci
    if ($LASTEXITCODE -ne 0) { Write-ErrorMsg "npm ci failed"; exit 1 }
} else {
    Write-ErrorMsg "Frontend directory not found at $frontendDir"
    exit 1
}

# 6. Launch backend and frontend concurrently
Write-Info "Launching backend and frontend…"
# Use Start-Job to run processes in parallel and keep the console responsive
$backendJob = Start-Job -ScriptBlock {
    cd "$using:projectRoot"
    # Activate venv inside the job
    & "$using:venvPath\Scripts\Activate.ps1"
    uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
}
$frontendJob = Start-Job -ScriptBlock {
    cd "$using:frontendDir"
    npm run dev
}

Write-Info "Backend (job $($backendJob.Id)) and Frontend (job $($frontendJob.Id)) started."
Write-Info "Press Ctrl+C to stop both services."

# Keep the script alive while both jobs run
while ($true) {
    Start-Sleep -Seconds 5
    $backendState = Get-Job -Id $backendJob.Id
    $frontendState = Get-Job -Id $frontendJob.Id
    if ($backendState.State -ne 'Running' -or $frontendState.State -ne 'Running') {
        Write-ErrorMsg "One of the services stopped. Exiting…"
        break
    }
}

# Cleanup
Stop-Job $backendJob -Force
Stop-Job $frontendJob -Force
Write-Info "All services stopped."
