param(
    [string]$ProjectId,
    [string]$ServiceName = "gemini-swarm-app",
    [string]$Region = "europe-west1",
    [string]$ARHostname = "europe-west1-docker.pkg.dev",
    [string]$ARRepository = "cloud-run-source-deploy"
)

# Get the directory where the script is located and the project root
$ScriptDir = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $ScriptDir
$Dockerfile = Join-Path $ScriptDir "Dockerfile"

# Check if we are in a valid project structure
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
    Write-Error "Could not find package.json in $ProjectRoot. Please ensure the script is inside the 'deployment' folder of the project."
    exit 1
}

# Check if gcloud is installed
if (-not (Get-Command "gcloud" -ErrorAction SilentlyContinue)) {
    Write-Error "Google Cloud SDK (gcloud) is not installed or not in PATH."
    exit 1
}

# Check if docker is installed
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed or not in PATH."
    exit 1
}

# Get Project ID if not provided
if (-not $ProjectId) {
    $ProjectId = gcloud config get-value project 2>$null
    if (-not $ProjectId) {
        $ProjectId = Read-Host "Enter your Google Cloud Project ID"
    } else {
        Write-Host "Using default project ID from gcloud config: $ProjectId"
    }
}

if (-not $ProjectId) {
    Write-Error "Project ID is required."
    exit 1
}

# Image name using Artifact Registry
$ImageName = "$ARHostname/$ProjectId/$ARRepository/$ServiceName"

Write-Host "1. Building Docker image..." -ForegroundColor Cyan
Write-Host "   Context: $ProjectRoot" -ForegroundColor Gray
Write-Host "   Dockerfile: $Dockerfile" -ForegroundColor Gray

# Build using the project root as context, regardless of current directory
docker build -t $ImageName -f "$Dockerfile" "$ProjectRoot"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker build failed."
    exit 1
}

Write-Host "2. Pushing image to Artifact Registry..." -ForegroundColor Cyan
docker push $ImageName

if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker push failed."
    exit 1
}

Write-Host "3. Deploying to Cloud Run..." -ForegroundColor Cyan
gcloud run deploy $ServiceName `
    --image $ImageName `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --port 8080

if ($LASTEXITCODE -ne 0) {
    Write-Error "Deployment failed."
    exit 1
}

Write-Host "Deployment successful!" -ForegroundColor Green
