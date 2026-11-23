#!/usr/bin/env node
/**
 * Validates the configs RYOX generates against the REAL core binaries.
 *
 * Why this exists: `tests/` only proves our own code is self-consistent. A
 * config can be perfectly valid TypeScript and still be rejected by sing-box or
 * Xray, which is what "the VPN connects but nothing loads" looks like in
 * practice. This script feeds every adapter a realistic matrix of servers and
 * lets each upstream core judge the result.
 *
 * Usage:
 *   npm run build:electron        # adapters are imported from dist-electron
 *   npm run validate:configs      # or: node scripts/validate-core-configs.js
 *
 * A missing core binary is reported as SKIP, never as a failure, so the script
 * is safe to run on a machine with no cores installed.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ADAPTER_DIR = path.join(ROOT, 'dist-electron', 'main', 'core', 'adapters');
const BIN_DIR = path.join(ROOT, 'bin');

function loadAdapters() {
  try {
    return {
      singBox: require(path.join(ADAPTER_DIR, 'SingBoxAdapter.js')).SingBoxAdapter,
      xray: require(path.join(ADAPTER_DIR, 'XrayAdapter.js')).XrayAdapter,
      mihomo: require(path.join(ADAPTER_DIR, 'MihomoAdapter.js')).MihomoAdapter,
    };
  } catch (err) {
    console.error(`Cannot load adapters from ${ADAPTER_DIR}.\nRun "npm run build:electron" first.\n${err.message}`);
    process.exit(2);
  }
}

const BASE_SETTINGS = {
  tunnelMode: 'SystemProxy',
  routingMode: 'Rule',
  autoConnectOnLaunch: false,
  startMinimized: false,
  killSwitch: false,
  dnsServers: ['1.1.1.1'],
  customDnsEnabled: true,
  dnsOverHttps: false,
  dohUrl: '',
  activeCore: 'sing-box',
  inboundHttpPort: 10809,
  inboundSocksPort: 10808,
  allowLan: false,
  bypassChinaAndIranLan: false,
  bypassPrivateIps: true,
  theme: 'cyberpunk',
  accentColor: '#00e5ff',
  language: 'fa',
  enableTlsFragment: false,
  fragmentLength: '100-200',
  fragmentInterval: '10-20',
};

const SETTING_VARIANTS = [
  { name: 'socks', patch: {} },
  { name: 'tun', patch: { tunnelMode: 'TUN' } },
  { name: 'killswitch', patch: { killSwitch: true } },
  { name: 'lan', patch: { allowLan: true } },
  { name: 'fragment', patch: { enableTlsFragment: true } },
];

let seq = 0;
function mkServer(overrides) {
  seq += 1;
  const now = Date.now();
  return Object.assign(
    {
      id: `validate-${seq}`,
      name: `Validate-${seq}`,
      server: '203.0.113.10',
      port: 443,
      protocol: 'vless',
      core: 'sing-box',
      tls: 'none',
      network: 'tcp',
      createdAt: now,
      updatedAt: now,
    },
    overrides,
  );
}

const CASES = [
  {
    name: 'vless + reality + vision',
    server: mkServer({
      protocol: 'vless',
      uuid: 'd3b07384-d113-494a-a0e2-e1c5188f58b0',
      tls: 'reality',
      publicKey: '6j_S1-n8vU3gR13k5lq0bFqA0C9Z6-Z1yA0pP1k7l_8',
      shortId: '6ba85580',
      sni: 'www.microsoft.com',
      flow: 'xtls-rprx-vision',
      fingerprint: 'chrome',
    }),
  },
  {
    name: 'vless + ws + tls',
    server: mkServer({
      protocol: 'vless',
      uuid: 'd3b07384-d113-494a-a0e2-e1c5188f58b0',
      tls: 'tls',
      network: 'ws',
      path: '/ray',
      host: 'cdn.example.com',
      sni: 'cdn.example.com',
      alpn: ['http/1.1'],
    }),
  },
  {
    name: 'vless + grpc + tls',
    server: mkServer({
      protocol: 'vless',
      uuid: 'd3b07384-d113-494a-a0e2-e1c5188f58b0',
      tls: 'tls',
      network: 'grpc',
      path: 'grpc-service-name',
      sni: 'cdn.example.com',
    }),
  },
  {
    name: 'vmess + ws + tls',
    server: mkServer({
      protocol: 'vmess',
      uuid: 'd3b07384-d113-494a-a0e2-e1c5188f58b0',
      tls: 'tls',
      network: 'ws',
      path: '/vmess',
      host: 'cdn.example.com',
      sni: 'cdn.example.com',
    }),
  },
  { name: 'trojan + tls', server: mkServer({ protocol: 'trojan', password: 'sup3r-s3cret', tls: 'tls', sni: 'trojan.example.com' }) },
  {
    name: 'shadowsocks aes-256-gcm',
    server: mkServer({ protocol: 'shadowsocks', method: 'aes-256-gcm', password: 'p@ssw0rd-shadowsocks' }),
  },
  {
    name: 'shadowsocks 2022',
    server: mkServer({
      protocol: 'shadowsocks',
      method: '2022-blake3-aes-128-gcm',
      // 2022 ciphers need a base64 key of exactly the cipher's key size.
      password: 'MDEyMzQ1Njc4OWFiY2RlZg==',
    }),
  },
  { name: 'hysteria2', server: mkServer({ protocol: 'hysteria2', password: 'hy2-secret', tls: 'tls', sni: 'hy2.example.com' }) },
  { name: 'tuic v5', server: mkServer({ protocol: 'tuic', uuid: 'd3b07384-d113-494a-a0e2-e1c5188f58b0', password: 'tuic-secret', tls: 'tls', sni: 'tuic.example.com' }) },
  {
    name: 'wireguard',
    server: mkServer({
      protocol: 'wireguard',
      privateKey: 'yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=',
      peerPublicKey: 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=',
      address: ['10.7.0.2/32'],
      dnsServers: ['1.1.1.1'],
      mtu: 1420,
    }),
  },
  { name: 'socks5 outbound', server: mkServer({ protocol: 'socks5', password: 'socks-pass' }) },
  { name: 'http outbound', server: mkServer({ protocol: 'http', password: 'http-pass' }) },
];

function binary(name) {
  const file = path.join(BIN_DIR, process.platform === 'win32' ? `${name}.exe` : name);
  return fs.existsSync(file) ? file : null;
}

/** The xray banner is printed on stdout even on failure, so pick the line that
 * actually explains the rejection instead of blindly taking the first one. */
function explain(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\u001b\[[0-9;]*m/g, '').trim())
    .filter(Boolean);
  const interesting = lines.find((line) => /FATAL|Failed|failed to|error|invalid|unknown field|cannot unmarshal|not found|unsupported|reject/i.test(line));
  return (interesting || lines[lines.length - 1] || 'no output').slice(0, 220);
}

function run(file, args) {
  try {
    execFileSync(file, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000, windowsHide: true });
    return { ok: true, out: '' };
  } catch (err) {
    const out = `${err.stdout ? err.stdout.toString() : ''}${err.stderr ? err.stderr.toString() : ''}${err.message || ''}`;
    return { ok: false, out: explain(out) };
  }
}

function main() {
  const adapters = loadAdapters();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ryox-cfg-'));
  const singBox = binary('sing-box');
  const xray = binary('xray');
  const mihomo = binary('mihomo');

  console.log(`adapters : ${ADAPTER_DIR}`);
  console.log(`cores    : sing-box=${singBox || 'MISSING'} xray=${xray || 'MISSING'} mihomo=${mihomo || 'MISSING'}`);
  console.log(`workdir  : ${tmp}\n`);

  const failures = [];
  let checks = 0;
  let skips = 0;

  for (const testCase of CASES) {
    const rows = [];

    for (const variant of SETTING_VARIANTS) {
      const settings = Object.assign({}, BASE_SETTINGS, variant.patch);
      const label = `${testCase.name} [${variant.name}]`;

      // sing-box + xray share this server object; core field does not matter to
      // the adapters, only the protocol does.
      if (singBox) {
        const file = path.join(tmp, `sb-${seq}-${rows.length}.json`);
        try {
          fs.writeFileSync(
            file,
            JSON.stringify(adapters.singBox.generateConfig(testCase.server, settings), null, 2),
            'utf-8',
          );
          const result = run(singBox, ['check', '-c', file]);
          checks += 1;
          rows.push({ core: 'sing-box', variant: variant.name, ...result });
          if (!result.ok) failures.push({ label: `sing-box ${label}`, out: result.out, file });
        } catch (err) {
          checks += 1;
          // A core that genuinely cannot serve a protocol is not a defect: the
          // adapter must REFUSE loudly instead of emitting a config that could
          // never work. Those rows are counted as skips, everything else fails.
          if (err && err.code === 'UNSUPPORTED_PROTOCOL') {
            skips += 1;
            rows.push({ core: 'sing-box', variant: variant.name, ok: true, skipped: true, out: `skipped: ${err.message}` });
          } else {
            rows.push({ core: 'sing-box', variant: variant.name, ok: false, out: `generator threw: ${err.message}` });
            failures.push({ label: `sing-box ${label}`, out: `generator threw: ${err.message}`, file });
          }
        }
      }

      if (xray) {
        const file = path.join(tmp, `xr-${seq}-${rows.length}.json`);
        try {
          fs.writeFileSync(
            file,
            JSON.stringify(adapters.xray.generateConfig(testCase.server, settings), null, 2),
            'utf-8',
          );
          const result = run(xray, ['-test', '-config', file]);
          checks += 1;
          rows.push({ core: 'xray', variant: variant.name, ...result });
          if (!result.ok) failures.push({ label: `xray ${label}`, out: result.out, file });
        } catch (err) {
          checks += 1;
          if (err && err.code === 'UNSUPPORTED_PROTOCOL') {
            skips += 1;
            rows.push({ core: 'xray', variant: variant.name, ok: true, skipped: true, out: `skipped: ${err.message}` });
          } else {
            rows.push({ core: 'xray', variant: variant.name, ok: false, out: `generator threw: ${err.message}` });
            failures.push({ label: `xray ${label}`, out: `generator threw: ${err.message}`, file });
          }
        }
      }

      if (mihomo) {
        const file = path.join(tmp, `mh-${seq}-${rows.length}.yaml`);
        try {
          fs.writeFileSync(file, adapters.mihomo.generateConfig(testCase.server, settings), 'utf-8');
          const result = run(mihomo, ['-t', '-f', file]);
          checks += 1;
          rows.push({ core: 'mihomo', variant: variant.name, ...result });
          if (!result.ok) failures.push({ label: `mihomo ${label}`, out: result.out, file });
        } catch (err) {
          checks += 1;
          if (err && err.code === 'UNSUPPORTED_PROTOCOL') {
            skips += 1;
            rows.push({ core: 'mihomo', variant: variant.name, ok: true, skipped: true, out: `skipped: ${err.message}` });
          } else {
            rows.push({ core: 'mihomo', variant: variant.name, ok: false, out: `generator threw: ${err.message}` });
            failures.push({ label: `mihomo ${label}`, out: `generator threw: ${err.message}`, file });
          }
        }
      }

      if (!singBox && !xray && !mihomo) skips += 1;
    }

    const bad = rows.filter((r) => !r.ok);
    const skipped = rows.filter((r) => r.skipped);
    console.log(`${bad.length === 0 ? 'ok  ' : 'FAIL'}  ${testCase.name}  (${rows.length} checks${skipped.length ? `, ${skipped.length} skipped` : ''}${singBox || xray || mihomo ? '' : ' - no core binary'})`);
    for (const row of rows.filter((r) => !r.ok)) {
      console.log(`        ${row.core}/${row.variant}: ${row.out}`);
    }
  }

  console.log(`\n${checks} checks, ${failures.length} failed, ${skips} skipped`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(` - ${failure.label}\n   ${failure.out}\n   ${failure.file}`);
    process.exit(1);
  }
  if (!singBox && !xray && !mihomo) {
    console.log('No core binaries found in bin/ — nothing was actually validated.');
    console.log('Run: powershell -File scripts/setup-cores.ps1');
    process.exit(0);
  }
  console.log('All generated configs were accepted by the real core binaries.');
}

main();
