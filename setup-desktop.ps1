#Requires -Version 5.1
<#
  Setup script for Bogatiy Kurier Pro
  Builds the Electron app and creates a desktop shortcut on Windows 10/11.
  Run by right-clicking setup-desktop.bat and selecting "Run as administrator"
  or by executing setup-desktop.ps1 from PowerShell.
#>
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$desktopDir = [Environment]::GetFolderPath('Desktop')
$appName = 'Bogatiy Kurier Pro'
$shortcutName = "$appName.lnk"

function Test-Command($cmd) {
  return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Find-UnpackedExe {
  $unpackedDir = Join-Path $projectDir 'dist-installer\win-unpacked'
  if (-not (Test-Path $unpackedDir)) { return $null }
  $exe = Get-ChildItem $unpackedDir -Filter '*.exe' | Select-Object -First 1
  if ($exe) { return $exe.FullName }
  return $null
}

Set-Location $projectDir
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  $appName - Desktop Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Check Node.js
if (-not (Test-Command 'node')) {
  Write-Host "Error: Node.js is not installed." -ForegroundColor Red
  Write-Host "Please download and install Node.js from https://nodejs.org/ (LTS version)"
  exit 1
}
Write-Host "Node.js version: $(node -v)" -ForegroundColor Green

# Check npm
if (-not (Test-Command 'npm')) {
  Write-Host "Error: npm is not installed." -ForegroundColor Red
  exit 1
}

# Install dependencies
Write-Host "`nInstalling dependencies..." -ForegroundColor Yellow
npm install

# Build app + installer
if (-not $SkipBuild) {
  Write-Host "`nBuilding desktop app (this may take a few minutes)..." -ForegroundColor Yellow
  npm run dist:win
}
else {
  Write-Host "`nSkipping build (--SkipBuild was used)." -ForegroundColor Yellow
}

# Find built executable
$exePath = Find-UnpackedExe
if (-not $exePath -or -not (Test-Path $exePath)) {
  Write-Host "`nError: Could not find the built application executable." -ForegroundColor Red
  Write-Host "Expected location: $projectDir\dist-installer\win-unpacked\" -ForegroundColor Red
  exit 1
}
Write-Host "`nApplication executable found: $exePath" -ForegroundColor Green

# Create desktop shortcut
$shortcutPath = Join-Path $desktopDir $shortcutName
$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = Split-Path -Parent $exePath
$shortcut.IconLocation = "$exePath,0"
$shortcut.Description = "$appName - JARVIS-style PC cleaner"
$shortcut.Save()

Write-Host "`n============================================" -ForegroundColor Green
Write-Host "  Desktop shortcut created successfully!" -ForegroundColor Green
Write-Host "  $shortcutPath" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "`nYou can now launch the app from your desktop." -ForegroundColor White