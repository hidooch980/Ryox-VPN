# Core binaries (`bin/`)

This directory is intentionally committed (almost) empty: it is the optional
drop-in location for VPN core executables.

## How binaries are resolved

`src/main/core/CoreManager.ts` looks for a core executable in this order:

1. `%APPDATA%\.ryox-vpn\bin\<core>.exe` — per-user install, created on first run.
2. `<app>/bin/<core>.exe` — this directory (bundled via `extraResources`).
3. Falls back to "virtual bridge mode" (`WARN` in the log) when neither exists.

## Expected files (Windows x64)

| Core | File | Notes |
| --- | --- | --- |
| sing-box | `sing-box.exe` | required for TUN / system-proxy |
| Xray-core | `xray.exe` | VMess / VLESS / Reality / TLS fragment |
| Mihomo | `mihomo.exe` | Clash Meta YAML profiles |
| sslocal | `sslocal.exe` | Shadowsocks fallback |

## Fetching them

```powershell
pwsh -File scripts/setup-cores.ps1
```

`*.exe`, `*.dll` and `*.dat` are git-ignored, so downloaded binaries are never
committed.
