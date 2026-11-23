import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * IPC contract test.
 *
 * Every channel the preload bridge exposes with `ipcRenderer.invoke`/`send`/`on`
 * must exist on the main side as `ipcMain.handle`/`ipcMain.on` (or a
 * `webContents.send` push), and vice versa. The assertions fail with the exact
 * channel names that are missing on either side, so a dead event (a
 * `webContents.send` nobody listens to, or an `invoke` nobody handles) is a
 * hard test failure instead of a silent no-op at runtime.
 */

const repoRoot = process.cwd();
const preloadPath = path.join(repoRoot, 'src', 'preload', 'index.ts');
const mainDir = path.join(repoRoot, 'src', 'main');

function readMainSources(): string {
  const sources: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) sources.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(mainDir);
  return sources.join('\n');
}

function collect(source: string, pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(pattern)) found.add(match[1]);
  return [...found].sort();
}

/** Empty string when the two channel sets match; otherwise the exact diff. */
function diffReport(a: string[], b: string[], aLabel: string, bLabel: string): string {
  const setA = new Set(a);
  const setB = new Set(b);
  const onlyA = [...setA].filter((c) => !setB.has(c)).sort();
  const onlyB = [...setB].filter((c) => !setA.has(c)).sort();

  const lines: string[] = [];
  if (onlyA.length > 0) lines.push(`only in ${aLabel}: ${onlyA.join(', ')}`);
  if (onlyB.length > 0) lines.push(`only in ${bLabel}: ${onlyB.join(', ')}`);
  return lines.join(' | ');
}

const preloadSource = fs.readFileSync(preloadPath, 'utf8');
const mainSource = readMainSources();

const preloadInvoke = collect(preloadSource, /ipcRenderer\.invoke\(\s*'([^']+)'/g);
const preloadSend = collect(preloadSource, /ipcRenderer\.send\(\s*'([^']+)'/g);
const preloadOn = collect(preloadSource, /ipcRenderer\.on\(\s*'([^']+)'/g);
const preloadRemoveListener = collect(preloadSource, /ipcRenderer\.removeListener\(\s*'([^']+)'/g);

const mainHandle = collect(mainSource, /ipcMain\.handle\(\s*'([^']+)'/g);
const mainOn = collect(mainSource, /ipcMain\.on\(\s*'([^']+)'/g);
const mainPush = collect(mainSource, /webContents\.send\(\s*'([^']+)'/g);

describe('IPC channel contract', () => {
  it('extracts channels from both sides (guards the parsing itself)', () => {
    expect(preloadInvoke.length).toBeGreaterThan(20);
    expect(mainHandle.length).toBeGreaterThan(20);
    expect(preloadSend.length).toBeGreaterThan(0);
    expect(mainOn.length).toBeGreaterThan(0);
    expect(preloadOn.length).toBeGreaterThan(0);
    expect(mainPush.length).toBeGreaterThan(0);
  });

  it('every invoke channel has a matching ipcMain.handle', () => {
    expect(diffReport(preloadInvoke, mainHandle, 'preload ipcRenderer.invoke', 'src/main ipcMain.handle')).toBe('');
  });

  it('every renderer send channel has a matching ipcMain.on', () => {
    expect(diffReport(preloadSend, mainOn, 'preload ipcRenderer.send', 'src/main ipcMain.on')).toBe('');
  });

  it('every main push event has a preload listener', () => {
    expect(diffReport(mainPush, preloadOn, 'src/main webContents.send', 'preload ipcRenderer.on')).toBe('');
  });

  it('every preload listener is removable (no leaked handlers)', () => {
    // `on` subscriptions must also appear in a `removeListener` cleanup.
    const missingCleanup = preloadOn.filter((c) => !preloadRemoveListener.includes(c));
    expect(missingCleanup.join(', ')).toBe('');
  });
});

/**
 * Source-level invariants for handlers that have no unit-testable seam (they
 * live in `src/main/index.ts`, which imports `electron` and cannot be required
 * from vitest). They pin the exact regressions fixed for D5/D6 and B7b.
 */
describe('main handler contracts', () => {
  const mainIndexPath = path.join(repoRoot, 'src', 'main', 'index.ts');
  const mainIndex = fs.readFileSync(mainIndexPath, 'utf8');

  function handlerBody(channel: string): string {
    const match = mainIndex.match(new RegExp(`ipcMain\\.handle\\('${channel}'[\\s\\S]*?\\n\\}\\);`));
    return match ? match[0] : '';
  }

  it('subscriptions:add|update|remove persist through storage.saveSubscriptions (D5)', () => {
    for (const channel of ['subscriptions:add', 'subscriptions:update', 'subscriptions:remove']) {
      const body = handlerBody(channel);
      expect(body, `${channel} handler not found in src/main/index.ts`).not.toBe('');
      expect(body, `${channel} must call storage.saveSubscriptions`).toContain('saveSubscriptions');
    }
  });

  it('subscriptions:update replaces (prunes + merges) this subscription\'s nodes (D6)', () => {
    const body = handlerBody('subscriptions:update');
    expect(body).not.toBe('');
    // The old bug: storage was only touched when `servers.length > 0`.
    expect(body).not.toContain('servers.length > 0');
    expect(body).toContain('replaceSubscriptionServers');
    expect(body).toContain('dedupeServers');
  });

  it('subscriptions:remove prunes the subscription\'s stored nodes', () => {
    const body = handlerBody('subscriptions:remove');
    expect(body).toContain('pruneSubscriptionServers');
  });

  it('cores:update queries CoreUpdater and never claims an install (B7b)', () => {
    const body = handlerBody('cores:update');
    expect(body).not.toBe('');
    expect(body).toContain('CoreUpdater.fetchLatestCoreRelease');
    expect(body).toContain('installed: false');
  });

  it('killswitch:enable refuses to arm while the tunnel is down (CORE-06)', () => {
    const body = handlerBody('killswitch:enable');
    expect(body).toContain("state !== 'CONNECTED'");
    expect(body).toContain("state !== 'VERIFYING'");
  });
});
