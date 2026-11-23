$ErrorActionPreference = "Stop"

$workspaceBin = Join-Path $PSScriptRoot "..\bin"
$appDataBin = Join-Path $env:APPDATA ".ryox-vpn\bin"
$tempDir = Join-Path $env:TEMP "ryox-core-downloads"

New-Item -ItemType Directory -Force -Path $workspaceBin | Out-Null
New-Item -ItemType Directory -Force -Path $appDataBin | Out-Null
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

Write-Host ">>> Fetching Official sing-box Core for Windows x64..." -ForegroundColor Cyan
$singBoxZip = Join-Path $tempDir "sing-box.zip"
$singBoxUrl = "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-windows-amd64.zip"

if (-not (Test-Path (Join-Path $workspaceBin "sing-box.exe"))) {
    Invoke-WebRequest -Uri $singBoxUrl -OutFile $singBoxZip -UserAgent "RYOX-Installer/1.0"
    Expand-Archive -Path $singBoxZip -DestinationPath (Join-Path $tempDir "singbox_extracted") -Force
    $singBoxExe = Get-ChildItem -Path (Join-Path $tempDir "singbox_extracted") -Recurse -Filter "sing-box.exe" | Select-Object -First 1
    Copy-Item $singBoxExe.FullName (Join-Path $workspaceBin "sing-box.exe") -Force
    Copy-Item $singBoxExe.FullName (Join-Path $appDataBin "sing-box.exe") -Force
    Write-Host "Installed sing-box.exe successfully." -ForegroundColor Green
} else {
    Write-Host "sing-box.exe already present." -ForegroundColor Green
}

Write-Host ">>> Fetching Official Xray-core for Windows x64..." -ForegroundColor Cyan
$xrayZip = Join-Path $tempDir "xray.zip"
$xrayUrl = "https://github.com/XTLS/Xray-core/releases/download/v26.11.9/Xray-windows-64.zip"

if (-not (Test-Path (Join-Path $workspaceBin "xray.exe"))) {
    Invoke-WebRequest -Uri $xrayUrl -OutFile $xrayZip -UserAgent "RYOX-Installer/1.0"
    Expand-Archive -Path $xrayZip -DestinationPath (Join-Path $tempDir "xray_extracted") -Force
    $xrayExe = Get-ChildItem -Path (Join-Path $tempDir "xray_extracted") -Recurse -Filter "xray.exe" | Select-Object -First 1
    Copy-Item $xrayExe.FullName (Join-Path $workspaceBin "xray.exe") -Force
    Copy-Item $xrayExe.FullName (Join-Path $appDataBin "xray.exe") -Force
    Write-Host "Installed xray.exe successfully." -ForegroundColor Green
} else {
    Write-Host "xray.exe already present." -ForegroundColor Green
}

Write-Host ">>> Verifying executable binary execution:" -ForegroundColor Yellow
& (Join-Path $workspaceBin "sing-box.exe") version
& (Join-Path $workspaceBin "xray.exe") version
