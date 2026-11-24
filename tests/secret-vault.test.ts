import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StorageManager } from '../src/main/storage/StorageManager';
import { SecretVault } from '../src/main/storage/SecretVault';
import { AppSettings, VpnServerConfig } from '../src/shared/types';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryox-vault-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
});

function server(overrides: Partial<VpnServerConfig> = {}): VpnServerConfig {
  return {
    id: 'vault-1',
    name: 'Node',
    server: 'a.example.com',
    port: 443,
    protocol: 'vless',
    core: 'xray',
    password: 'super-secret-uuid-1234',
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

describe('SecretVault', () => {
  it('never writes credentials as plaintext on disk', () => {
    const dir = makeTempDir();
    new StorageManager(dir).saveServers([server()]);

    const raw = fs.readFileSync(path.join(dir, 'servers.json'), 'utf-8');
    expect(raw).not.toContain('super-secret-uuid-1234');
    expect(raw).not.toContain('a.example.com');
    expect(JSON.parse(raw).v).toBe(2);
  });

  it('round-trips servers through the envelope', () => {
    const dir = makeTempDir();
    new StorageManager(dir).saveServers([server()]);

    const reloaded = new StorageManager(dir).getServers();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].password).toBe('super-secret-uuid-1234');
  });

  it('reads legacy plaintext and seals it on the next save', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'servers.json'), JSON.stringify([server()], null, 2), 'utf-8');

    const storage = new StorageManager(dir);
    expect(storage.getServers()[0].password).toBe('super-secret-uuid-1234');

    storage.saveServers(storage.getServers());
    const raw = fs.readFileSync(path.join(dir, 'servers.json'), 'utf-8');
    expect(raw).not.toContain('super-secret-uuid-1234');
    expect(JSON.parse(raw).v).toBe(2);
  });

  it('does not throw when the payload cannot be decrypted', () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, 'servers.json'),
      JSON.stringify({ v: 2, enc: 'local-key', payload: 'bm90LXJlYWxseS1hbi1lbnZlbG9wZQ==' }),
      'utf-8'
    );

    expect(() => new StorageManager(dir).getServers()).not.toThrow();
    expect(new StorageManager(dir).getServers()).toEqual([]);
    // An intact envelope this session cannot open must not be quarantined:
    // a later run with a working keychain can still read it.
    expect(fs.existsSync(path.join(dir, 'servers.json'))).toBe(true);
  });

  it('keeps the local key out of the JSON stores', () => {
    const dir = makeTempDir();
    new StorageManager(dir).saveServers([server()]);
    const keyFile = path.join(dir, 'storage.key');
    expect(fs.existsSync(keyFile)).toBe(true);
    expect(fs.readFileSync(keyFile).length).toBe(32);
  });

  it('opens what it seals', () => {
    const dir = makeTempDir();
    const vault = new SecretVault(dir);
    const sealed = vault.seal({ token: 'abc' });
    expect(vault.open<{ token: string }>(sealed)).toEqual({ token: 'abc' });
  });

  it('does not persist the runtime-only clash API token', () => {
    const dir = makeTempDir();
    const settings: AppSettings = {
      tunnelMode: 'TUN',
      routingMode: 'Rule',
      autoConnectOnLaunch: false,
      startMinimized: false,
      killSwitch: true,
      dnsServers: ['1.1.1.1'],
      customDnsEnabled: true,
      dnsOverHttps: true,
      dohUrl: 'https://1.1.1.1/dns-query',
      activeCore: 'sing-box',
      inboundHttpPort: 10809,
      inboundSocksPort: 10808,
      allowLan: false,
      bypassChinaAndIranLan: true,
      bypassPrivateIps: true,
      theme: 'cyberpunk',
      accentColor: '#00e5ff',
      language: 'fa',
      enableTlsFragment: false,
      fragmentLength: '100-200',
      fragmentInterval: '10-20',
      clashApiPort: 9090,
      clashApiSecret: 'runtime-token'
    };

    const storage = new StorageManager(dir);
    storage.saveSettings(settings);

    const raw = fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8');
    expect(raw).not.toContain('runtime-token');
    expect(new StorageManager(dir).getSettings().clashApiPort).toBe(9090);
  });
});
