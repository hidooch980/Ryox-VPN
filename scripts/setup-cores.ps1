#Requires -Version 5.1
<#
    Downloads the VPN core binaries RYOX VPN needs.

    Works both on the Windows PowerShell that ships with Windows
    (`powershell -ExecutionPolicy Bypass -File scripts/setup-cores.ps1`)
    and on PowerShell 7+ (`pwsh -File scripts/setup-cores.ps1`).

    Binaries land in two places:
      * bin/                       -> used when running from source
      * %APPDATA%\.ryox-vpn\bin    -> used by the installed app
#>
[CmdletBinding()]
param(
    # Re-download even when the executable is already present.
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 negotiates TLS 1.0/1.1 by default and GitHub refuses
# those handshakes. Prefer 1.2+ (Tls13 does not exist on .NET Framework).
try {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
} catch {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

$workspaceBin = Join-Path $PSScriptRoot "..\bin"
$appDataBin = Join-Path $env:APPDATA ".ryox-vpn\bin"
$tempDir = Join-Path $env:TEMP "ryox-core-downloads"

foreach ($dir in @($workspaceBin, $appDataBin, $tempDir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$cores = @(
    @{
        Name = "sing-box"
        Exe  = "sing-box.exe"
        Url  = "https://github.com/SagerNet/sing-box/releases/download/v1.14.4/sing-box-1.14.4-windows-amd64.zip"
    },
    @{
        Name = "Xray-core"
        Exe  = "xray.exe"
        Url  = "https://github.com/XTLS/Xray-core/releases/download/v26.11.9/Xray-windows-64.zip"
    },
    @{
        Name = "Mihomo"
        Exe  = "mihomo.exe"
        Url  = "https://github.com/MetaCubeX/mihomo/releases/download/v1.19.0/mihomo-windows-amd64-v1.19.0.zip"
    }
)

foreach ($core in $cores) {
    $target = Join-Path $workspaceBin $core.Exe
    if ((Test-Path $target) -and -not $Force) {
        Write-Host "$($core.Exe) is already present (pass -Force to re-download)." -ForegroundColor Green
        continue
    }

    Write-Host ">>> Fetching $($core.Name) for Windows x64..." -ForegroundColor Cyan
    $zip = Join-Path $tempDir "$($core.Exe).$(Get-Random).zip"
    $extractDir = Join-Path $tempDir "$($core.Exe)-extracted"

    # -UseBasicParsing keeps this working on 5.1 without the IE engine.
    Invoke-WebRequest -Uri $core.Url -OutFile $zip -UserAgent "RYOX-Installer/1.0" -UseBasicParsing

    Remove-Item -Recurse -Force -Path $extractDir -ErrorAction SilentlyContinue
    Expand-Archive -Path $zip -DestinationPath $extractDir -Force

    $exe = Get-ChildItem -Path $extractDir -Recurse -Filter $core.Exe | Select-Object -First 1
    if (-not $exe) {
        throw "$($core.Exe) was not found inside $($core.Url)"
    }

    Copy-Item $exe.FullName $target -Force
    Copy-Item $exe.FullName (Join-Path $appDataBin $core.Exe) -Force
    Remove-Item -Force -Path $zip -ErrorAction SilentlyContinue
    Write-Host "Installed $($core.Exe)." -ForegroundColor Green
}

Write-Host ">>> Verifying the installed binaries:" -ForegroundColor Yellow
& (Join-Path $workspaceBin "sing-box.exe") version
& (Join-Path $workspaceBin "xray.exe") version
& (Join-Path $workspaceBin "mihomo.exe") -v

Write-Host "Done. Configs can now be validated with: npm run validate:cores" -ForegroundColor Cyan
