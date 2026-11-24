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
- **Test Suite Status**: **102 tests across 10 files — 91 passing, 11 skipped** (skips are real-binary/real-network cases that need `bin/` and connectivity)
- **Core Config Validation**: **180 generated configs checked by the real `sing-box 1.14.4` / `Xray 26.11.9` / `Mihomo v1.19.0` binaries — 0 rejected, 15 skipped** (protocol a core genuinely cannot serve) via `npm run validate:cores`
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
| **Phase 9** | Automated Testing | **COMPLETED** | 102 Vitest tests across 10 files (unit + integration + real-core config validation + credential vault) |
| **Phase 10** | GitHub CI/CD Automation | **COMPLETED** | Workflows: `ci-tests`, `android-build`, `windows-build`, `release` |
| **Phase 11** | Release Verification | **COMPLETED** | `v1.0.0` tag → release pipeline published installer, portable zip and APK |

---

## 3. Automated Test Verification Results

Output of `npm run test` (Vitest):

```text
 RUN  v3.2.7

 ✓ tests/core-adapters.test.ts (26 tests | 10 skipped)
 ✓ tests/killswitch-proxy.test.ts (17 tests)
 ✓ tests/protocol-parser.test.ts (14 tests)
 ✓ tests/server-parsing.test.ts (10 tests)
 ✓ tests/ipc-contract.test.ts (10 tests)
 ✓ tests/secret-vault.test.ts (7 tests)
 ✓ tests/vpn-connection.test.ts (6 tests | 1 skipped)
 ✓ tests/features.test.ts (5 tests)
 ✓ tests/security-hardening.test.ts (5 tests)
 ✓ tests/updater-verification.test.ts (2 tests)

 Test Files  10 passed (10)
      Tests  91 passed | 11 skipped (102)
   Duration  5.03s
```

Real-core config validation (`npm run validate:cores`), which compiles `dist-electron/`
and runs every generated config through the upstream binaries:

```text
ok    vless + reality + vision  (15 checks)
ok    vless + ws + tls  (15 checks)
ok    vless + grpc + tls  (15 checks)
ok    vmess + ws + tls  (15 checks)
ok    trojan + tls  (15 checks)
ok    shadowsocks aes-256-gcm  (15 checks)
ok    shadowsocks 2022  (15 checks)
ok    hysteria2  (15 checks, 5 skipped)
ok    tuic v5  (15 checks, 5 skipped)
ok    wireguard  (15 checks, 5 skipped)
ok    socks5 outbound  (15 checks)
ok    http outbound  (15 checks)

180 checks, 0 failed, 15 skipped
All generated configs were accepted by the real core binaries.
```

### Coverage breakdown

1. **URI & Subscription Parsing** — VLESS Reality + XTLS Vision (`pbk`, `sid`, `flow`, `sni`, `fp`), VMess Base64 JSON, Trojan TLS, Shadowsocks AEAD SIP002 + legacy, Hysteria 2, unpadded Base64, literal-`%` names, invalid ports, multi-line and Base64 subscription batches.
2. **Core Config Adapters** — sing-box TUN inbound (`ryox-tun`, `strict_route`, remote DoH, `address[]`), wireguard `endpoints[]`, `action:'reject'` rules, Xray SOCKS5/HTTP inbounds with Reality `streamSettings`, Mihomo (Clash Meta) YAML, TLS `record_fragment` wiring, and a real-binary acceptance test per core.
3. **VPN State Machine** — `DISCONNECTED → CONNECTING → VERIFYING → CONNECTED → DISCONNECTED`, cancellation during connect, core-death detection, node failover, and a real sing-box core listening on the inbound port.
4. **Security & Updaters** — SHA256 checksum verification against tampering; kill-switch safety guards (refuses to arm without an elevated shell and a real core binary, rolls back the firewall policy); system-proxy snapshot/restore without touching the registry when nothing was applied; traffic-meter behaviour with no running core.
5. **IPC Contract** — bidirectional `invoke`/`handle` and `send`/`on` parity between `src/main` and `src/preload`, so a renamed channel cannot silently ship.
6. **Advanced features** — WARP profile generation (Curve25519 + clean IP) and real download speed measurement (or an honest failure).

> Note: `tests/features.test.ts` and the real-core adapter test perform real I/O (WARP, speed test, `sing-box.exe`), so the suite needs connectivity and a populated `bin/` for full coverage; missing binaries are skipped.

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

### 3.2 Connection Engine (`VpnConnectionManager`, `CoreManager`, `SmartConnectService`)

| Defect | Impact before | Fix |
| :--- | :--- | :--- |
| `connect()` had no attempt token and was not serialised | Disconnecting during a connect still ended in `CONNECTED`, and a fast double-click started two connects that both rewrote the system proxy | Monotonic `attempt` token checked after every `await`; connect/disconnect serialised |
| `CONNECTED` was asserted without verification | A healthy-looking UI over no tunnel | `VERIFYING` state + TCP probe of `127.0.0.1:<inbound port>`; failure tears the session down and reports `ERROR` |
| Missing core binary returned `true` with no process | "Connected" with no internet | `startCore()` returns `false` and logs the exact missing path + install command |
| Readiness meant "the process was alive for 500 ms" | A core that exits on a bad config was reported as ready | `waitForListeningPort()` polls the real inbound socket before reporting ready |
| Core death was invisible (not an `EventEmitter`) | UI stayed `CONNECTED`, system proxy pointed at a dead port, kill switch stayed armed | `setExitCallback()` + exit identity guard; unexpected exit → proxy off, kill switch disarmed, `ERROR` |
| `stopCore()` resolved before the process died; the SIGKILL escalation was unreachable dead code (`proc.killed`) | A surviving core kept the ports, so the next core could not bind | Await `exit` with a grace timer, then `taskkill /PID <pid> /T /F` |
| Smart connect tried exactly one node; its `catch` was dead | A single unreachable node meant "no server found" | `rankServers()` probes all, `smartConnect()` walks up to 5 candidates and disconnects before giving up |
| One malformed node aborted auto-select (`net.createConnection` throws synchronously on a NaN port inside a promise executor) | Every other node was discarded | Port validation in the parser + per-probe try/catch |
| The old `TrafficMeter` interval was overwritten without `stop()` | A PowerShell process spawned every 2 s forever; double-counted traffic | Old meter stopped before a new one starts |
| No sleep/resume handling | After resume the UI showed `CONNECTED` with ping 0 | `powerMonitor.on('resume')` → `handleResume()` re-verifies and tears down when dead |
| A `settings:save` swap mid-connect mixed cores/configs | Config generated from one core, applied settings from another | Settings snapshot taken once at the top of `connect()` |
| `SystemProxyManager.enableProxy()` returning `false` was ignored | Claimed success with no proxy applied | Failure aborts the connect and reports `ERROR` |
| Hard-coded core versions in `getCoresMetadata()` | UI reported sing-box `1.11.0` / Xray `24.11.30` | Updated to `1.14.4` / `26.11.9` |

### 3.3 Servers, Links & Subscriptions

| Defect | Impact before | Fix |
| :--- | :--- | :--- |
| Base64 subscriptions were only accepted when padded and standard-alphabet | Whole subscriptions ingested **0** servers | Lenient decode before line-splitting; strictness moved to per-line parsing |
| Missing/invalid ports were persisted as `null` | `servers:ping` threw `ERR_INVALID_ARG_VALUE` and the ping-all button died for the session | Shared `isValidPort()` in every parser + legacy rows filtered on read |
| Unpadded `ss://` userinfo decoded to a bogus cipher and no password | Nodes that could never dial | Method/password required and validated; password split on the first `:` |
| Clash `type: ss` mapped to protocol `ss`; core selection was always `xray` (`proto === 'vless' \|\| 'vmess' \|\| 'trojan'` is always truthy) | Clash nodes never worked | `ss → shadowsocks`, `socks → socks5`, real array membership for the core |
| Subscriptions were never persisted (`saveSubscriptions` was never called) | Every restart re-injected the hard-coded sample subscription | `SubscriptionManager` hydrates from storage and persists add/update/remove |
| Stale servers were never pruned when a subscription shrank | Dead nodes accumulated forever | `replaceSubscriptionServers()` prunes on refresh, `pruneSubscriptionServers()` on delete |
| `servers.json` was written non-atomically | A truncated file fell back to 7 hard-coded seed servers, losing the user's list | `.tmp` + `.bak` + rename, with `.corrupt-<ts>` quarantine and restore |
| A literal `%` in a node name threw `URIError` | The node was silently dropped | `safeDecode()` at all five decode sites |
| De-duplication keys differed per call path | Duplicate nodes from subscriptions and the free-source feed | One exported `dedupeServers()` used everywhere |

### 3.4 Core Adapters & Config Generation (validated against the real binaries)

| Defect | Impact before | Fix |
| :--- | :--- | :--- |
| sing-box TUN used `inet4_address` | Every TUN config rejected since sing-box 1.12 (`FATAL ... legacy tun address fields are deprecated`) | `address: ['172.19.0.1/30']` |
| sing-box TLS fragment was an object | Config rejected (`json: cannot unmarshal object`) | Boolean `tls.record_fragment` (`fragmentLength`/`fragmentInterval` are no longer expressible there) |
| Legacy `block` outbound + `outbound:'block'` rules | Removed in sing-box 1.13 | Rule `action:'reject'` |
| Legacy `wireguard` outbound | Removed in sing-box 1.13 | `endpoints: [{ type: 'wireguard', ... }]` + `route.final` |
| Shadowsocks-2022 keys were not validated | `bad key length, required 16, got 28` at runtime | `assertShadowsocksKey()` (base64, 16/32 bytes) |
| Xray rules referenced external geodata | `xray` refused to start without `geosite`/`geoip` files | Inline CIDR/TLD rules |
| Mihomo emitted `shadowsocks`, no `tun.device`, `GEOIP,private` | `mihomo -t` rejected the profile | `ss`, `tun.device: ryox-tun`, `IP-CIDR,...,no-resolve` |
| `allowInsecure` was never plumbed | Most free nodes (self-signed / IP SNI / expired certs) failed the handshake | Field added to `VpnServerConfig` and mapped per core |
| Any core was asked to serve any protocol (`settings: {}`) | `unknown protocol` / silent misconfiguration | Typed `UnsupportedCoreFeatureError` with `code` instead of a broken config |
| Transports only handled `ws`/`grpc` | `http`/`quic`/`kcp` silently degraded to raw TCP | ws/grpc/http(h2)/quic mapped; unsupported combinations throw |

### 3.5 Kill Switch & System Proxy

| Defect | Impact before | Fix |
| :--- | :--- | :--- |
| Kill switch installed an explicit `dir=out action=block` catch-all before its allow rules | Windows evaluates explicit block rules first, so the allow rules were inert: enabling it cut the machine **and** the tunnel off | Profile default policy flipped (`netsh advfirewall set allprofiles firewallpolicy ...`) + three narrow allow rules (core program, `ryox-tun`, loopback) |
| No rollback and no state | A crash could leave the machine blocked | Policy captured before mutation, persisted, rolled back on failure; `arm()` disarms first; refuses to run without elevation |
| System proxy overwrote the user's `ProxyServer`/`ProxyOverride` and never restored them | User settings lost after using the app | Snapshot + persist before writing, exact restore after, WinINet refresh (`InternetSetOption`/`WS_SETTINGCHANGE`) |
| No crash recovery for the proxy | A killed app left the whole machine without internet | `restoreOnStartup()` (idempotent, only touches our own loopback proxy) |

### 3.6 IPC, Settings & UI Honesty

| Defect | Impact before | Fix |
| :--- | :--- | :--- |
| `servers-updated` was emitted with no preload bridge and no listener | Fetched servers never appeared until restart | `onServersUpdated` bridged + subscribed (with `removeListener` cleanup) |
| `cores:update` was `async () => true`; the page waited 1.2 s and showed `alert("verified and up-to-date")` | Fake updater | Real handler querying `CoreUpdater`, honest `up-to-date`/`update-available`/`network-error`/`unknown-core` statuses, and "install is not implemented" |
| The kill-switch toggle armed the firewall while disconnected | Machine left with no network and no tunnel | Arming requires `CONNECTED`/`VERIFYING`; otherwise only the preference is stored |
| Diagnostics invented values: `dnsLeakDetected: false`, ping 45/52, `tunAdapterStatus: 'Active'`, hard-coded public IP `185.199.108.153` / US / Fastly | Users were told they were safe when nothing had been checked | `dnsLeakDetected: null` (= not verified), unmeasured latency is `-1`/`—`, TUN status read from real interfaces, public IP omitted on failure |
| The speed test returned `18.5 Mbps / 2.31 MB/s / 420 ms` on failure | Fabricated speed | `measured`/`reason` fields; failure reports zeros and an amber notice |
| Seven seed servers carried invented latencies (30/48/33/42/55/35/28 ms) | Fake ping values in the list, dashboard and world map | Fabricated values removed; latency is only shown once a real probe measured it |
| Android/browser mocks returned the same fabricated diagnostics | Same dishonesty on Android | Mock mirrors the honest contract |

### 3.7 Android

| Defect | Impact before | Fix |
| :--- | :--- | :--- |
| Connect forwarded only name/server/port and hard-coded a Shadowsocks outbound with a fixed password | Every non-Shadowsocks node was connected with the wrong protocol while the UI said `Connected` | `buildSingBoxConfig()` builds the outbound from the node's own fields; unsupported protocols refuse to start and notify the UI |
| `builder.establish()` was never checked | Failed tunnels showed `Connected` plus a permanent notification, and blocked later attempts | `fd == null` → stop the service and clear the notification |
| Quick-settings tile started the service without `VpnService.prepare()` | Crash / silent no-op on Android 8+ | Consent requested via `startActivityAndCollapse` (API 34 overload) |
| The Android shim exposed `getSources`/`fetchAllSources`/`toggleSource`/`getCoresMetadata` while the UI called `getFreeSources`/`fetchAllFreeSources`/`toggleFreeSource`/`getCores`/`checkForAppUpdates` | `App.loadAllData` threw and **nothing loaded at all** | Names aligned; app-update returns an honest "not available on Android" |
| Stats were constants (`totalUpload: 12500000`, `sessionDuration: 340`, `pingMs: 42`) and nothing ever pushed updates | Dashboard frozen at 11.9 MB / 05:40 | `TrafficStats` deltas pushed every second; zeros when no tunnel |
| No `addRoute`, no-op kill switch | TUN captured almost nothing; the shield could claim `ARMED` | Working path documented (mixed inbound + `setHttpProxy`); kill switch reports `UNAVAILABLE` honestly instead of faking success |
| `RECEIVE_BOOT_COMPLETED` with no receiver, `allowBackup="true"` | Unusable permission; `ryox_vpn_prefs` (passwords, subscription URLs) could be backed up | Permission removed, `allowBackup="false"`, explicit backup/exclusion rules |
| WebView allowed file/content access and mixed content; `pingServer` probed anything | Attack surface | Locked down; TCP probe restricted to public hostnames/IPs |

### 3.8 Tooling & Documentation

| Defect | Impact before | Fix |
| :--- | :--- | :--- |
| `bin/README.md` documented `pwsh -File scripts/setup-cores.ps1`, but `pwsh` is not installed on a stock Windows | The only documented way to install a core failed | `setup-cores.ps1` now works on Windows PowerShell 5.1 (TLS 1.2, `-UseBasicParsing`), adds Mihomo and `-Force`; README documents both shells |
| `scripts/validate-live-config.ts` was referenced nowhere and could not run (no `tsx`/`ts-node`) | Dead code that promised config validation | Replaced by `scripts/validate-core-configs.js` + `npm run validate:cores` (12 protocols × 5 modes against the real binaries) |
| Android assets were copied into the APK by hand | Stale hashed bundles shipped inside the APK | `npm run android:assets` replaces the directory and fails when `index.html` references a missing file; CI uses it |
| Duplicate ~45 MB Android core blobs were tracked | Inflated repository | Removed from the index (`git rm --cached`) and ignored; local copies preserved, licence file kept |

### 3.9 Credential Vault, Controller Telemetry & Auto-Switch

| Area | Before | After |
| :--- | :--- | :--- |
| Credential storage | `servers.json` / `subscriptions.json` / `settings.json` held proxy passwords, UUIDs and subscription tokens as plaintext JSON | `src/main/storage/SecretVault.ts` seals every store with AES-256-GCM under a per-install key (`storage.key`, 32 bytes, created on first use). `StorageManager` seals on write and opens on read, so a legacy plaintext file is still readable and is re-sealed by the next save — no separate migration step. `clashApiSecret` is stripped before persisting (runtime-only). |
| Unreadable envelope | — | An envelope this session cannot open is **left in place** and reported in the log; only a file that is not parseable JSON (or not an array) is quarantined to `.corrupt-<ts>` and recovered from `.bak`. This keeps a temporary keychain failure from destroying data. |
| Throughput telemetry | Windows performance counters of the core process only — counted the core's own IPC/disk traffic and returned 0 B/s in TUN mode | `src/main/vpn/ClashApiClient.ts` polls the core's Clash-compatible `/connections` endpoint once per second when `clashApiPort` is set (both `SingBoxAdapter` and `MihomoAdapter` emit the controller block only when a port is configured, so a default config is byte-identical to before). Three consecutive failures fall back to the process counters automatically. |
| Controller secret | — | Generated per session with `crypto.randomBytes(16)` inside `CoreManager` and never logged or persisted, so a token from a previous run cannot authenticate against the new one. |
| Node health | Ping was displayed but never acted on | `src/main/vpn/HealthMonitor.ts` keeps an EWMA quality score (0-100, `HEALTH_ALPHA` 0.25) mapped from round-trip time; after `HEALTH_SWITCH_AFTER_BAD_SAMPLES` (3) consecutive samples below `HEALTH_BAD_THRESHOLD` (35) the manager reconnects to the fastest same-core node that has a **measured** latency (`src/main/index.ts` supplies the choice). Off by default (`autoSwitchEnabled`). |

```text
tests/secret-vault.test.ts (7 tests)
  ✓ never writes credentials as plaintext on disk
  ✓ round-trips servers through the envelope
  ✓ reads legacy plaintext and seals it on the next save
  ✓ does not throw when the payload cannot be decrypted
  ✓ keeps the local key out of the JSON stores
  ✓ opens what it seals
  ✓ does not persist the runtime-only clash API token
```

Release workflow now installs the cores (`scripts/setup-cores.ps1 -Force`) and fails the job when any
of `bin/sing-box.exe`, `bin/xray.exe`, `bin/mihomo.exe` is missing, then runs `npm run validate:cores`
before packaging — a release can no longer ship without the binaries it needs.

> Validation caveat: `npm run validate:cores` compiles `dist-electron/` first, so `npm run build:electron`
> must run before it. In a checkout without `bin/` it reports `0 checks, 0 failed, 60 skipped` and exits 0,
> which is why the release workflow installs the cores before validating.

---

## 4. Build Status & Verification

| Step | Command | Result |
| :--- | :--- | :--- |
| Typecheck (renderer + Electron) | `npm run typecheck` | exit 0 |
| Unit/integration tests | `npm run test` | 91 pass / 11 skipped (10 files, 5.03 s) |
| Real-core config validation | `npm run validate:cores` | 180 checks, 0 failed, 15 skipped |
| Renderer bundle | `npm run build:renderer` | 2245 modules → `dist/` |
| Electron main + preload | `npm run build:electron` | → `dist-electron/` |
| Android web assets | `npm run android:assets` | `dist/` → `android/app/src/main/assets/web` |
| Windows packaging | `npx electron-builder --dir --x64` | → `dist-packaged/win-unpacked/` (`resources/icon.ico`, `resources/bin`, `app.asar` verified) |

Packaging prerequisites that are now committed and verified:

- `build/icon.ico` (multi-size 16→256 px) — used by electron-builder `win.icon` **and** copied to `resources/icon.ico` via `extraResources` so the window/tray icon also works in packaged builds.
- `bin/README.md` — documents core-binary resolution (`%APPDATA%\.ryox-vpn\bin` → `<app>\resources\bin` → repo `bin`); actual binaries stay git-ignored.
- A real core install is one command: `npm run setup:cores`.

---

## 5. Known Constraints

- A core executable must exist in `bin/` or `%APPDATA%\.ryox-vpn\bin`. Without one, connecting now **fails with an explicit error** naming the missing binary and the install command — the app no longer reports `CONNECTED` with no tunnel. Run `npm run setup:cores` once.
- Android release builds are signed with the debug keystore (open-source default) — replace with a private keystore before a Play Store submission.
- Android TUN currently captures traffic through the mixed inbound + `setHttpProxy` path (`CAPTURE_ALL_TRAFFIC_IN_TUN = false`). A default `addRoute("0.0.0.0", 0)` needs a core build that accepts a passed-in TUN file descriptor, which the bundled `libsingbox.so` does not expose.
- The Android kill switch is a documented no-op and reports `UNAVAILABLE` (`VpnService` has no firewall API); only the desktop build has a real kill switch.
- The credential vault's key lives in `%APPDATA%\.ryox-vpn\storage.key` next to the sealed stores, so it protects against casual inspection, backup/cloud sync of the JSON, and log paste leaks — not against an attacker who can already read the user profile. Losing the key makes the sealed stores unreadable; the app then reports the condition and leaves the files untouched instead of deleting them.
- Auto-switch only considers nodes whose latency was measured by an explicit ping test in the same session; an untested node is never assumed to be faster. With no measured alternatives the feature stays idle rather than guessing.
- A freshly generated WARP profile carries `latency: -1` (unprobed) rather than a hard-coded 35 ms, because Smart Connect ranks on `latency` and a made-up value used to outrank genuinely measured nodes. Run a ping test to give a WARP profile a real figure.
- `tests/features.test.ts` calls the live Cloudflare WARP registration endpoint; that one test overrides vitest's 5 s default with a 20 s timeout. Without connectivity it falls back to the standard WARP pool allocation and still passes.
- Repository size is dominated by committed Android native cores (`libsingbox.so`, `sing-box` arm64 binary, `singbox-arm64.tar.gz`); see "Next Steps".

---

## 6. Next Steps for Maintainers

1. Keep `npm run typecheck`, `npm run test` and `npm run validate:cores` in CI (wired into `.github/workflows/ci-tests.yml`) so type errors, contract drift and config regressions cannot reach a release.
2. Delete the Android extension/core blobs from history (a `git rm` alone cannot shrink a clone) if repository size matters: `git filter-repo --path sing-box-1.10.7-android-arm64 --path singbox-arm64.tar.gz --invert-paths`, then force-push all refs including the `v1.0.0` tag. Discuss with maintainers first — existing clones must re-clone.
3. Replace the debug signing config with a dedicated release keystore for distribution.
4. Ship a core that accepts a TUN file descriptor to enable Android full-tunnel routing; the current Android path is proxy-based.
5. Tag `vX.Y.Z` to publish installers/APK through the release workflow.
