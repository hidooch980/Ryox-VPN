import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StorageManager } from '../src/main/storage/StorageManager';
import { SubscriptionManager } from '../src/main/subscription/SubscriptionManager';
import { ProtocolParser, dedupeServers } from '../src/main/protocol/parser';
import { Subscription, VpnServerConfig } from '../src/shared/types';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryox-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.unstubAllGlobals();
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
    id: 'ryox-test-1',
    name: 'Node',
    server: 'a.example.com',
    port: 443,
    protocol: 'vless',
    core: 'xray',
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

describe('StorageManager durability', () => {
  it('recovers the stored list from the backup instead of wiping it when servers.json is corrupt', () => {
    const dir = makeTempDir();
    const storage = new StorageManager(dir);
    const first = server({ id: 'keep-1', server: 'first.example.com' });
    const second = server({ id: 'keep-2', server: 'second.example.com' });

    storage.saveServers([first]); // main = [first]
    storage.saveServers([first, second]); // backup = [first], main = [first, second]

    fs.writeFileSync(path.join(dir, 'servers.json'), '{"broken": ', 'utf-8');

    const recovered = storage.getServers();
    expect(recovered.length).toBeGreaterThan(0);
    expect(recovered.map(s => s.id)).toEqual(['keep-1']);

    // The unreadable file must be preserved, never silently dropped.
    expect(fs.readdirSync(dir).some(f => f.startsWith('servers.json.corrupt-'))).toBe(true);
    // The restored file stays consistent for the next read.
    expect(storage.getServers().map(s => s.id)).toEqual(['keep-1']);
  });

  it('drops servers with an invalid or missing port before they reach the adapters', () => {
    const dir = makeTempDir();
    const storage = new StorageManager(dir);
    storage.saveServers([
      server({ id: 'ok', port: 443 }),
      server({ id: 'zero', port: 0 }),
      server({ id: 'huge', port: 70000 }),
      server({ id: 'nan', port: NaN }),
      server({ id: 'null', port: null as unknown as number }),
      server({ id: 'nohost', server: '' })
    ]);

    expect(storage.getServers().map(s => s.id)).toEqual(['ok']);
  });

  it('writes atomically and leaves no .tmp file behind', () => {
    const dir = makeTempDir();
    const storage = new StorageManager(dir);
    storage.saveServers([server()]);

    expect(fs.existsSync(path.join(dir, 'servers.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'servers.json.tmp'))).toBe(false);
  });

  it('round-trips every subscription field through storage', () => {
    const dir = makeTempDir();
    const storage = new StorageManager(dir);
    const sub: Subscription = {
      id: 'sub-1',
      name: 'My Sub',
      url: 'https://example.com/sub',
      enabled: false,
      updateIntervalHours: 6,
      lastUpdated: 123456789,
      serverCount: 42,
      userAgent: 'v2rayN/6.39',
      error: 'HTTP 500'
    };
    storage.saveSubscriptions([sub]);

    const reloaded = new StorageManager(dir).getSubscriptions();
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toEqual(sub);
  });
});

describe('SubscriptionManager persistence and pruning', () => {
  it('persists added subscriptions and hydrates them on a fresh manager', () => {
    const dir = makeTempDir();
    const manager = new SubscriptionManager(new StorageManager(dir));
    const added = manager.addSubscription('Fresh Sub', 'https://example.com/fresh', 6);

    expect(fs.existsSync(path.join(dir, 'subscriptions.json'))).toBe(true);

    const reloaded = new SubscriptionManager(new StorageManager(dir)).getSubscriptions();
    const persisted = reloaded.find(s => s.id === added.id);
    expect(persisted).toBeDefined();
    expect(persisted).toMatchObject({
      id: added.id,
      name: 'Fresh Sub',
      url: 'https://example.com/fresh',
      enabled: true,
      updateIntervalHours: 6,
      serverCount: 0
    });
  });

  it('prunes a subscription stored servers before merging the fresh set, including an empty set', () => {
    const dir = makeTempDir();
    const storage = new StorageManager(dir);
    const manager = new SubscriptionManager(storage);
    storage.saveServers([
      server({ id: 'a-old', subscriptionId: 'sub-a' }),
      server({ id: 'a-old-2', subscriptionId: 'sub-a' }),
      server({ id: 'b-keep', subscriptionId: 'sub-b' })
    ]);

    manager.replaceSubscriptionServers('sub-a', [server({ id: 'a-new', subscriptionId: 'sub-a' })]);
    expect(storage.getServers().map(s => s.id).sort()).toEqual(['a-new', 'b-keep']);

    // An empty fresh set must still remove the stale nodes.
    manager.replaceSubscriptionServers('sub-a', []);
    expect(storage.getServers().map(s => s.id)).toEqual(['b-keep']);
  });

  it('clears stale servers when a refresh succeeds but returns no nodes', async () => {
    const dir = makeTempDir();
    const storage = new StorageManager(dir);
    const manager = new SubscriptionManager(storage);
    const sub = manager.addSubscription('Empty Sub', 'https://example.com/empty', 6);
    storage.saveServers([
      server({ id: 'stale', subscriptionId: sub.id }),
      server({ id: 'other', subscriptionId: 'sub-other' })
    ]);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '' })));

    const result = await manager.updateSubscription(sub.id);
    expect(result).toEqual([]);
    expect(storage.getServers().map(s => s.id)).toEqual(['other']);
  });
});

describe('dedupeServers', () => {
  it('keeps nodes that share a host but differ in secret', () => {
    const a = server({ id: 'id-a', server: 'shared.example.com' });
    const b = server({ id: 'id-b', server: 'shared.example.com' });
    expect(dedupeServers([a, b])).toHaveLength(2);
  });

  it('drops exact duplicate ids and falls back to server:port:protocol', () => {
    const a = server({ id: 'same' });
    const b = server({ id: 'same' });
    const noId1 = server({ id: '', server: 'x.example.com', protocol: 'trojan' });
    const noId2 = server({ id: '', server: 'x.example.com', protocol: 'trojan' });
    expect(dedupeServers([a, b])).toHaveLength(1);
    expect(dedupeServers([noId1, noId2])).toHaveLength(1);
  });
});

describe('ProtocolParser lenient base64 helper', () => {
  it('decodes unpadded payloads and rejects non-base64 text', () => {
    expect(ProtocolParser.tryDecodeBase64('dHJvamFuOi8vcEBzLmNvbTo0NDMjTg')).toBe('trojan://p@s.com:443#N');
    expect(ProtocolParser.tryDecodeBase64('100%')).toBeNull();
    expect(ProtocolParser.decodeBase64Payload('not base64 at all')).toBe('not base64 at all');
  });
});
