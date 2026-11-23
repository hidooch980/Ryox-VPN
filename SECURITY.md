# Security Policy — RYOX VPN

The security and privacy of our users are the paramount priorities of RYOX VPN.

## Supported Versions

| Version | Supported |
| :--- | :--- |
| 1.0.x | :white_check_mark: |
| < 1.0.0 | :x: |

## Core Security Commitments

1. **Zero Information Leakage in Logs**: Sensitive credentials (private keys, passwords, UUIDs, full destination URLs) are scrubbed from exported logs.
2. **Encrypted DNS**: Default DNS queries use encrypted DNS-over-HTTPS (DoH) via Cloudflare or Quad9, eliminating DNS poisoning and ISP snooping.
3. **Kill Switch Protection**: If the underlying VPN tunnel is severed, outbound traffic is automatically stopped to prevent IP leakage.
4. **Integrity Verification**: Automatic updates are verified using cryptographic SHA256 checksums before installation.
5. **No Telemetry / No Tracking**: RYOX VPN contains zero usage tracking, user profiling, or browsing telemetry.

## Reporting a Vulnerability

If you discover a security vulnerability within RYOX VPN, please report it privately:

- **Email**: `security@ryoxvpn.org`
- **GitHub Security Advisory**: Open a private advisory on the GitHub repository.

Please do not open public GitHub issues for critical vulnerabilities until a patched release is published.
