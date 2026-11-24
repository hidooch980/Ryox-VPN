#Requires -Version 7.4
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-Location (Join-Path $PSScriptRoot '..')
$repo = 'hidooch980/Ryox-VPN'
$commit = (git rev-parse HEAD).Trim()
$remote = (git ls-remote origin refs/heads/main).Split()[0]
if ($commit -ne $remote) { throw 'Publish the intended commit to main before releasing Android.' }
$version = [regex]::Match((Get-Content android/app/build.gradle.kts -Raw), 'versionName = "([0-9]+\.[0-9]+\.[0-9]+)"').Groups[1].Value
if (!$version) { throw 'Missing Android version' }
$tag = "android-v$version"
$dir = Join-Path (Get-Location) "dist-packaged/android-$version"
New-Item -ItemType Directory -Force $dir | Out-Null
function Invoke-ReleaseJob([string]$mode) {
    $url = gh workflow run android-release.yml -R $repo --ref main -f "mode=$mode" -f "release_tag=$tag"
    $run = [regex]::Match(($url -join ''), '/runs/(\d+)').Groups[1].Value
    if (!$run) { throw 'Workflow run ID unavailable' }
    $head = gh run view $run -R $repo --json headSha --jq '.headSha'
    if ($head -ne $commit) { throw 'Workflow is building a different commit' }
    gh run watch $run -R $repo --compact --interval 20 --exit-status | Out-Host
    return $run
}
$existing = @(gh api --paginate "repos/$repo/releases?per_page=100" --jq ".[] | select(.tag_name == `"$tag`") | .draft")
if ($existing -contains 'false') { throw "Version $tag is already published" }
$keyDir = Join-Path $env:USERPROFILE '.android/ryox-local-signing'
$key = Get-Item (Join-Path $keyDir 'ryox-release.p12')
$run = Invoke-ReleaseJob build
gh run download $run -R $repo -n android-local-signing -D "$dir/staging-$run"
$signer = "$dir/staging-$run/apksigner.jar"
if ((Get-FileHash $signer).Hash -ne '00EF9948F843FE395D2440AE3EF41405B8040A6D5D46493BD1902AC0EE6DEAE7') { throw 'Android signing tool does not match the trusted build-tools 35.0.0 jar' }
$apk = "$dir/RYOX-VPN-$version.apk"
try {
    $protected = (Get-Content (Join-Path $keyDir 'password.dpapi') -Raw).Trim()
    $env:RYOX_LOCAL_KEY_PASSWORD = [Net.NetworkCredential]::new('',(ConvertTo-SecureString $protected)).Password
    java -jar $signer sign --ks $key.FullName --ks-key-alias ryox --ks-pass env:RYOX_LOCAL_KEY_PASSWORD --out $apk "$dir/staging-$run/aligned.apk"
} finally { Remove-Item Env:RYOX_LOCAL_KEY_PASSWORD -ErrorAction SilentlyContinue }
java -jar $signer verify --verbose $apk
$hash = (Get-FileHash $apk).Hash.ToLower()
"$hash  RYOX-VPN-$version.apk" | Set-Content "$dir/SHA256SUMS.txt" -Encoding ascii
if (!$existing.Count) {
    gh release create $tag -R $repo --draft --target $commit --title "RYOX VPN $version for Android" --generate-notes
}
gh release upload $tag -R $repo $apk "$dir/SHA256SUMS.txt" --clobber
Invoke-ReleaseJob install-test | Out-Null
$release = gh release view $tag -R $repo --json assets | ConvertFrom-Json
$asset = $release.assets | Where-Object name -eq "RYOX-VPN-$version.apk"
if ($asset.digest -ne "sha256:$hash") { throw 'Remote APK digest mismatch' }
gh release edit $tag -R $repo --draft=false --latest=false
