import { SingBoxAdapter } from '../src/main/core/adapters/SingBoxAdapter';
import { XrayAdapter } from '../src/main/core/adapters/XrayAdapter';
import { VpnServerConfig, AppSettings } from '../src/shared/types';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const testServer: VpnServerConfig = {
  id: 'test-audit-reality',
  name: 'Audit-US-Reality',
  server: '1.1.1.1',
  port: 443,
  protocol: 'vless',
  core: 'sing-box',
  uuid: 'd3b07384-d113-494a-a0e2-e1c5188f58b0',
  tls: 'reality',
  publicKey: '6j_S1-n8vU3gR13k5lq0bFqA0C9Z6-Z1yA0pP1k7l_8',
  shortId: '6ba85580',
  sni: 'www.microsoft.com',
  flow: 'xtls-rprx-vision',
  fingerprint: 'chrome',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

const testSettings: AppSettings = {
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
  language: 'fa'
};

// 1. Sing-box
const singboxConfig = SingBoxAdapter.generateConfig(testServer, testSettings);
const sbPath = path.join(__dirname, 'temp_audit_singbox.json');
fs.writeFileSync(sbPath, JSON.stringify(singboxConfig, null, 2), 'utf-8');

execFile(path.join(__dirname, '..', 'bin', 'sing-box.exe'), ['check', '-c', sbPath], (err, stdout, stderr) => {
  if (err) {
    console.error('sing-box check error:', stderr || err.message);
  } else {
    console.log('SUCCESS: sing-box configuration passed format and schema validation!');
  }
});

// 2. Xray
const xrayConfig = XrayAdapter.generateConfig(testServer, testSettings);
const xrayPath = path.join(__dirname, 'temp_audit_xray.json');
fs.writeFileSync(xrayPath, JSON.stringify(xrayConfig, null, 2), 'utf-8');

execFile(path.join(__dirname, '..', 'bin', 'xray.exe'), ['-test', '-config', xrayPath], (err, stdout, stderr) => {
  if (err) {
    console.error('Xray check error:', stderr || err.message);
  } else {
    console.log('SUCCESS: Xray-core configuration passed format and schema validation!');
    console.log(stdout.trim());
  }
});
