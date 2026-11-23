# Contributing to RYOX VPN

Thank you for your interest in contributing to RYOX VPN! We welcome contributions from developers, security researchers, and network specialists around the world.

## Guiding Principles

1. **100% Free Forever**: No PR that introduces paid features, ads, paywalls, or premium tiers will ever be accepted.
2. **Open Standards**: We prioritize open, well-documented protocols (VLESS Reality, Hysteria 2, WireGuard, sing-box).
3. **Security First**: Ensure all user credentials and private keys remain strictly local and isolated.

## Local Development Workflow

### Prerequisites
- Node.js 22+
- npm 10+
- Java 17+ (for Android builds)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/ryox-vpn/Ryox-VPN.git
cd Ryox-VPN

# Install dependencies
npm install

# Run automated tests
npm run test

# Run desktop app in development mode
npm run dev

# Compile production builds
npm run build
```

### Submitting a Pull Request
1. Fork the repo and create your feature branch: `git checkout -b feature/awesome-feature`
2. Run test suite: `npm run test`
3. Commit your changes: `git commit -m 'Add awesome feature'`
4. Push to branch and open a Pull Request against `main`.
