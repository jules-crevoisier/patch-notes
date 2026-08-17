# =============================================================================
# Variante PowerShell de scripts/deploy.sh — utile pour tester l'image de prod
# en local depuis Windows avant de pousser sur le serveur.
# -----------------------------------------------------------------------------
# Usage  :  ./scripts/deploy.ps1
#           ./scripts/deploy.ps1 -NoPull
#           ./scripts/deploy.ps1 -Logs
# =============================================================================

[CmdletBinding()]
param(
    [switch]$NoPull,
    [switch]$Logs
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".env")) {
    Write-Error ".env manquant. Copie .env.production.example vers .env et configure-le."
    exit 1
}

$required = @(
    "SITE_URL",
    "POSTGRES_PASSWORD", "BLOG_SECRET", "GEMINI_API_KEY"
)
$envContent = Get-Content .env
$missing = @()
foreach ($key in $required) {
    if (-not ($envContent | Where-Object { $_ -match "^${key}=.+" })) {
        $missing += $key
    }
}
if ($missing.Count -gt 0) {
    Write-Error ("Variables manquantes ou vides dans .env :`n  - {0}" -f ($missing -join "`n  - "))
    exit 1
}

$compose = @("compose", "-f", "docker-compose.yml", "-f", "docker-compose.prod.yml")

if (-not $NoPull) {
    Write-Host "==> git pull"
    git pull --rebase --autostash
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "==> Pull des images de base"
docker @compose pull --ignore-buildable
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Build du blog"
docker @compose build blog
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Up -d"
docker @compose up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Attente du healthcheck blog (60s max)"
$deadline = (Get-Date).AddSeconds(60)
$healthy  = $false
while ((Get-Date) -lt $deadline) {
    $status = (docker @compose ps --format '{{.Service}} {{.Health}}' |
               Where-Object { $_ -match "^blog " }) -replace "^blog ", ""
    if ($status -eq "healthy") { $healthy = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    Write-Warning "blog pas healthy. Logs :"
    docker @compose logs --tail 50 blog
    exit 1
}

Write-Host "==> État final"
docker @compose ps

if ($Logs) {
    docker @compose logs -f --tail=20
}

$siteUrl = ($envContent | Where-Object { $_ -match "^SITE_URL=" }) -replace "^SITE_URL=", ""
Write-Host "==> OK : $siteUrl"
