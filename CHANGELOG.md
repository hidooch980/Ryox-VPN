# Changelog — RYOX VPN

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-23

### Initial Production Release

#### Added
- **Multi-Core Modular System**:
  - Integrated adapters for `sing-box`, `Xray-core`, `Mihomo (Clash Meta)`, `WireGuard`, and `Hysteria 2`.
  - Dynamic configuration compilation with live validation.
- **Protocol Support**:
  - Native VLESS Reality with XTLS Vision flow and uTLS fingerprint emulation.
  - Hysteria 2 UDP congestion control with BBR.
  - VMess, Trojan TLS, Shadowsocks 2022 AEAD, and WireGuard.
- **Networking & Tunneling**:
  - Windows Layer-3 Wintun TUN mode (`ryox-tun`).
  - Windows WinINet System Proxy mode.
  - Android `VpnService` with Quick Settings Tile toggle.
  - Automatic Kill Switch traffic leak protection.
  - DNS-over-HTTPS (DoH) encrypted resolver integration.
  - Application-level Split Tunneling.
  - Smart GeoIP & Geosite routing (bypass LAN, domestic services, and ad blocking).
- **Public Free Configuration Discovery**:
  - Automated scraper for public community configurations from GitHub and open-source repositories.
  - Deduplication and real-time latency ping testing.
- **Premium User Interface**:
  - 17 complete interactive pages with Cyberpunk neon glow aesthetic and dark/light modes.
  - Live throughput telemetry chart and animated power button.
- **Automatic Updates**:
  - GitHub Releases API integration with SHA256 checksum verification.
- **Automated CI/CD**:
  - GitHub Actions workflows for Windows packaging, Android APK compilation, and automated releases.
