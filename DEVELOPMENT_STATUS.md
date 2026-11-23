# RYOX VPN — Development Status & Engineering Ledger

Official engineering status, test results, build metrics, and milestone verification log for **RYOX VPN**.

Last verified: local `dsh` worktree build on Windows 11 (x64), Node 22, npm workspace install.
Repository: <https://github.com/hidooch980/Ryox-VPN>

---

## 1. Executive Summary

- **Product**: RYOX VPN
- **Version**: `v1.0.0`
- **Business Model**: 100% Free Forever • Open Source (Apache 2.0) • Zero Ads • Zero Paywalls
- **Platforms**: Windows 10/11 (x64) and Android 10+ (arm64-v8a)
- **Core Architecture**: Modular multi-core engine — `sing-box`, `Xray-core`, `Mihomo`, `WireGuard`, plus `Wintun` for Layer-3 TUN on Windows
- **Overall Build Status**: **STABLE (GREEN)** — typecheck, tests, renderer build and Electron build all pass locally and in CI
- **Published artifacts (v1.0.0 release)**: `RYOX.VPN.Setup.1.0.0.exe` (114 MB), `RYOX.VPN-1.0.0-win.zip` (115.3 MB), `RYOX-VPN-v1.0.0.apk` (47.1 MB), `SHA256SUMS.txt`
- **Test Suite Status**: **22 / 22 tests passing (6 files)**
- **Type Checking**: `npm run typecheck` (renderer + Electron) — clean
- **Language Support**: فارسی (Persian, RTL) + English

---

## 2. Milestone Execution Matrix

| Phase | Milestone | Status | Key Deliverables & Evidence |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Architecture & Tech Stack | **COMPLETED** | Electron + TypeScript + Vite + Tailwind; native Android `VpnService` |
| **Phase 2** | Brand Identity & UI Design | **COMPLETED** | Cyberpunk design system, vector logo, 17 pages, generated app icons (`build/icon.ico`) |
| **Phase 3** | Multi-Core Engine Integration | **COMPLETED** | `CoreManager` with sing-box / Xray / Mihomo adapters, binary resolution + graceful fallback |
| **Phase 4** | Real VPN Connections | **COMPLETED** | Wintun Layer-3 TUN, WinINet system proxy, Android `VpnService` |
| **Phase 5** | Config & Subscription Manager | **COMPLETED** | Parsers for VLESS, VMess, Trojan, Shadowsocks, Hysteria 2, WireGuard, Clash YAML |
| **Phase 6** | Public Free Sources Discovery | **COMPLETED** | Curated GitHub feed scraper with de-duplication and latency testing |
| **Phase 7** | Advanced Networking | **COMPLETED** | GeoIP/Geosite routing, DNS-over-HTTPS, split tunneling, TLS fragment |
| **Phase 8** | Automatic Updaters | **COMPLETED** | App updater via GitHub Releases, core updater with SHA256 integrity |
| **Phase 9** | Automated Testing | **COMPLETED** | 22 Vitest tests across 6 files (unit + integration) |
| **Phase 10** | GitHub CI/CD Automation | **COMPLETED** | Workflows: `ci-tests`, `android-build`, `windows-build`, `release` |
| **Phase 11** | Release Verification | **COMPLETED** | `v1.0.0` tag → release pipeline published installer, portable zip and APK |

---

## 3. Automated Test Verification Results

Output of `npm run test` (Vitest):

```text
 RUN  v3.2.7

 ✓ tests/updater-verification.test.ts (2 tests)
 ✓ tests/protocol-parser.test.ts (6 tests)
 ✓ tests/core-adapters.test.ts (3 tests)
 ✓ tests/security-hardening.test.ts (5 tests)
 ✓ tests/vpn-connection.test.ts (1 test)
 ✓ tests/features.test.ts (5 tests)

 Test Files  6 passed (6)
      Tests  22 passed (22)
   Duration  4.47s
```

### Coverage breakdown

1. **URI & Subscription Parsing** — VLESS Reality + XTLS Vision (`pbk`, `sid`, `flow`, `sni`, `fp`), VMess Base64 JSON, Trojan TLS, Shadowsocks AEAD SIP002 + legacy, Hysteria 2, multi-line and Base64 subscription batches.
2. **Core Config Adapters** — sing-box TUN inbound (`ryox-tun`, `strict_route`, remote DoH), Xray SOCKS5/HTTP inbounds with Reality `streamSettings`, Mihomo (Clash Meta) YAML, TLS-fragment outbound wiring.
3. **VPN State Machine** — `DISCONNECTED → CONNECTING → VERIFYING → CONNECTED → DISCONNECTED`.
4. **Security & Updaters** — SHA256 checksum verification against tampering; kill-switch safety guards (refuses to arm without a real core binary; the service façade shares one state with `KillSwitch`); traffic-meter behaviour with no running core.
5. **Advanced features** — WARP profile generation (Curve25519 + clean IP) and real download speed measurement.

> Note: `tests/features.test.ts` performs real network I/O (WARP + speed test), so the suite takes a few seconds and needs connectivity.

---

## 3.1 Correctness Fixes Applied in This Pass

| # | Defect | Impact before | Fix |
| :-- | :--- | :--- | :--- |
| 1 | `AppSettings` initializer missing `enableTlsFragment`, `fragmentLength`, `fragmentInterval` | Renderer `tsc` failed (`TS2345`) | Defaults added in `src/renderer/src/App.tsx` |
| 2 | `npm run build` never typechecked the renderer | Type errors could reach `main` | `npm run typecheck` script + CI step in all three workflows |
| 3 | `.gitignore` contained a bare `build/` | `build/icon.ico` could not be committed → no installer, window or tray icon | Pattern narrowed to build outputs; icon committed and shipped via `extraResources` |
| 4 | Tray creation crashed/hid the app when the icon was absent | Silent tray failure | `canCreateTray()` guard, asset resolution for dev + packaged, tray skipped with a warning |
| 5 | `startMinimized` setting was never read by the main process | Toggle did nothing | `createWindow({ hidden })` driven by the setting, only when a tray exists |
| 6 | `autoConnectOnLaunch` setting was never read by the main process | Toggle did nothing | Startup smart-connect path added (2 s after ready, never blocks boot) |
| 7 | `before-quit` used a non-awaited async handler | Kill-switch firewall rules could outlive the process and leave the machine offline | `preventDefault()` + awaited disconnect/disarm + `quitCleanupDone` guard |
| 8 | Two divergent kill-switch implementations; the active one blocked *all* outbound traffic while allowing only proxy ports | Enabling the kill switch also blocked the core's own connection to the node, tearing the tunnel down | Single real implementation in `src/main/vpn/KillSwitch.ts` (exempts core process, TUN adapter, loopback); `KillSwitchService` is now a façade |
| 9 | Kill switch could arm with no core binary present | Machine left with no network and no tunnel | `arm()` fails closed and reports `false`; the UI shows `UNAVAILABLE` instead of faking `ARMED` |
| 10 | Dashboard kill-switch badge was driven by the *setting*, not the real firewall state | UI claimed protection that was not installed | `LiveStats.killSwitchArmed` reported from the actual arm result |
| 11 | Upload/download/ping telemetry was randomised (`Math.random`) | Fabricated traffic figures shown to users | `src/main/vpn/TrafficMeter.ts` reads real per-process Windows perf counters; ping uses a real TCP handshake via `DiagnosticsService.testTcpLatency` |
| 12 | Closing the window quit the app even though a tray existed | "Start minimized to tray" was pointless; an active tunnel died on window close | Window close hides to tray while the tray exists; tray *Quit* performs the awaited cleanup |
| 13 | Android workflow left stale hashed bundles in `assets/web` | APK shipped obsolete JS/CSS alongside the new ones | Workflow wipes `assets/web` before copying; committed assets regenerated |
| 14 | Release workflow appended checksums and could hash its own file | Duplicate/incorrect `SHA256SUMS.txt` on re-run | File recreated per run and excluded from hashing |

---

## 4. Build Status & Verification

| Step | Command | Result |
| :--- | :--- | :--- |
| Typecheck (renderer + Electron) | `npm run typecheck` | exit 0 |
| Unit/integration tests | `npm run test` | 22/22 pass |
| Renderer bundle | `npm run build:renderer` | 2245 modules → `dist/` |
| Electron main + preload | `npm run build:electron` | → `dist-electron/` |
| Windows packaging | `npx electron-builder --win nsis zip --x64` | → `dist-packaged/` |

Packaging prerequisites that are now committed and verified:

- `build/icon.ico` (multi-size 16→256 px) — used by electron-builder `win.icon` **and** copied to `resources/icon.ico` via `extraResources` so the window/tray icon also works in packaged builds.
- `bin/README.md` — documents core-binary resolution (`%APPDATA%\.ryox-vpn\bin` → `<app>/bin`); actual binaries stay git-ignored.

---

## 5. Known Constraints

- Without a core executable in `bin/` or `%APPDATA%\.ryox-vpn\bin`, `CoreManager` logs `WARN ... virtual bridge mode` and no real tunnel is established (by design, so the UI still runs).
- Android release builds are signed with the debug keystore (open-source default) — replace with a private keystore before a Play Store submission.
- Repository size is dominated by committed Android native cores (`libsingbox.so`, `sing-box` arm64 binary, `singbox-arm64.tar.gz`); see "Next Steps".

---

## 6. Next Steps for Maintainers

1. Keep `npm run typecheck` in CI (now wired into `.github/workflows/ci-tests.yml`) so renderer type errors cannot regress.
2. Optionally drop the duplicate Android core blobs (`sing-box-1.10.7-android-arm64/sing-box` duplicates `jniLibs/arm64-v8a/libsingbox.so`) and fetch them at build time to shrink the repo.
3. Replace the debug signing config with a dedicated release keystore for distribution.
4. Tag `vX.Y.Z` to publish installers/APK through the release workflow.
