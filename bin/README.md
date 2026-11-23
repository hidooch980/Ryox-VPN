# Core binaries (`bin/`)

This directory is intentionally committed empty (apart from this file): it is the
drop-in location for the VPN core executables.

**RYOX VPN cannot tunnel without at least one core.** Without a core the app now
refuses to connect and logs why, instead of pretending to be connected.

## How binaries are resolved

`src/main/core/CoreManager.ts` looks for `<core>.exe` in this order:

1. explicit overrides (tests only),
2. `%APPDATA%\.ryox-vpn\bin\<core>.exe` — per-user install, what the script below writes,
3. `<install>\resources\bin\<core>.exe` — shipped inside the packaged app (`extraResources`),
4. `<repo>\bin\<core>.exe` — development only.

## Expected files (Windows x64)

| Core | File | Used for |
| --- | --- | --- |
| sing-box | `sing-box.exe` | TUN mode, system proxy, most protocols |
| Xray-core | `xray.exe` | VMess / VLESS / Reality / TLS fragment |
| Mihomo | `mihomo.exe` | Clash Meta YAML profiles |
| sslocal | `sslocal.exe` | Shadowsocks fallback (optional) |

## Fetching them

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-cores.ps1
```

The script works on the Windows PowerShell 5.1 that ships with Windows, and on
PowerShell 7+ (`pwsh -File scripts/setup-cores.ps1`). Pass `-Force` to
re-download binaries that are already present.

`*.exe`, `*.dll` and `*.dat` are git-ignored, so downloaded binaries are never
committed.

## Checking that the generated configs are valid

```powershell
npm run build:electron
npm run validate:cores
```

This generates every supported protocol × mode combination, writes it to a temp
directory and validates it with the real `sing-box check` / `xray -test` /
`mihomo -t` binaries. Missing binaries are reported as `SKIP`; any rejected
config is printed with the core's own error message and the script exits 1.
