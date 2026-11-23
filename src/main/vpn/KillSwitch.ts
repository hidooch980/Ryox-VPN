import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/* ------------------------------------------------------------------------ *
 * Firewall rules
 * ------------------------------------------------------------------------ */

/**
 * Catch-all `action=block dir=out` rule installed by the pre-fix version. It is
 * no longer created (see {@link KILL_SWITCH_FIREWALL_POLICY}) but is still
 * deleted, so machines upgrading from the broken build get cleaned up.
 */
const RULE_BLOCK_LEGACY = 'RYOX-KillSwitch-BlockAll';
const RULE_CORE = 'RYOX-KillSwitch-AllowCore';
const RULE_TUN = 'RYOX-KillSwitch-AllowTun';
const RULE_LOOPBACK = 'RYOX-KillSwitch-AllowLoopback';

/** Every rule name this app has ever created; all are removed on disarm. */
const ALL_RULES = [RULE_BLOCK_LEGACY, RULE_CORE, RULE_TUN, RULE_LOOPBACK];

const TUN_INTERFACE_NAME = 'ryox-tun';
const COMMAND_TIMEOUT_MS = 15000;

/** Windows' out-of-the-box profile policy. */
export const DEFAULT_FIREWALL_POLICY = 'blockinbound,allowoutbound';

/**
 * Policy installed while the kill switch is armed.
 *
 * Windows Firewall evaluates explicit *block* rules before allow rules for
 * outbound traffic (there is no outward "Override block rules" option), so the
 * old explicit `action=block` catch-all made the three allow rules inert and
 * blocked the core's own connection to the node as well. Changing the profile
 * *default* policy is what actually works: allow rules do take effect against a
 * default policy.
 */
export const KILL_SWITCH_FIREWALL_POLICY = 'blockinbound,blockoutbound';

export type FirewallProfile = 'domain' | 'private' | 'public';

export interface FirewallPolicyEntry {
  profile: FirewallProfile;
  policy: string;
}

/** A single registry value captured verbatim so it can be restored exactly. */
export interface RegistryValueSnapshot {
  type: string;
  data: string;
}

/** Previous `Internet Settings` proxy values (`null` = value did not exist). */
export interface SystemProxySnapshot {
  proxyEnable: RegistryValueSnapshot | null;
  proxyServer: RegistryValueSnapshot | null;
  proxyOverride: RegistryValueSnapshot | null;
  /** What enableProxy() installed, so a startup restore can recognise it. */
  activeProxyServer: string;
  snapshotAt: string;
}

/**
 * Shared crash-recovery file (`killswitch-state.json`). It holds the firewall
 * policy captured before arming *and* the proxy snapshot taken before
 * enableProxy(), because both must survive a crash of the VPN process.
 */
export interface AppState {
  version: 1;
  armed?: boolean;
  armedAt?: string;
  firewallPolicy?: { entries: FirewallPolicyEntry[]; raw: string };
  systemProxy?: SystemProxySnapshot;
}

/* ------------------------------------------------------------------------ *
 * Command execution (injectable for tests)
 * ------------------------------------------------------------------------ */

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

const realRunner: CommandRunner = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { timeout: COMMAND_TIMEOUT_MS, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const code = (error as NodeJS.ErrnoException & { code?: number | string }).code;
        const err = new Error(String(stderr || error.message).trim() || error.message) as Error & {
          code?: number | string;
          exitCode?: number | string;
        };
        err.code = code;
        err.exitCode = code;
        reject(err);
        return;
      }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });

let runner: CommandRunner = realRunner;

/**
 * Test seam: run every system command through `fn` instead of a real process.
 * Passing no argument (or `undefined`) restores the real system runner.
 *
 * Tests MUST inject a fake runner — nothing in this module may ever execute a
 * real `netsh`/`reg` mutation during a test run.
 */
export function setCommandRunnerForTests(fn?: CommandRunner): void {
  runner = fn ?? realRunner;
}

/** Run a system command through the (possibly injected) runner. */
export function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return runner(command, args);
}

/** True when the runner is the real one (i.e. not a test injection). */
export function isUsingRealRunner(): boolean {
  return runner === realRunner;
}

/* ------------------------------------------------------------------------ *
 * Crash-recovery state file
 * ------------------------------------------------------------------------ */

let stateFilePathOverride: string | undefined;

/** Test seam: force the state file location (avoids touching the real one). */
export function setAppStateFilePathForTests(filePath?: string): void {
  stateFilePathOverride = filePath;
}

export function getAppStateFilePath(): string {
  if (stateFilePathOverride) return stateFilePathOverride;

  try {
    if (typeof require === 'function') {
      const electron = require('electron') as { app?: { getPath?: (name: string) => string } } | undefined;
      if (electron && electron.app && typeof electron.app.getPath === 'function') {
        return path.join(electron.app.getPath('userData'), 'killswitch-state.json');
      }
    }
  } catch {
    // Not running inside Electron (unit tests / plain node) — fall through.
  }

  const base = process.env.APPDATA || process.env.LOCALAPPDATA || process.env.HOME || process.cwd();
  return path.join(base, '.ryox-vpn', 'killswitch-state.json');
}

export function readAppState(): AppState | null {
  try {
    const file = getAppStateFilePath();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as AppState;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return null;
    return parsed;
  } catch (err) {
    console.warn('[RyoxState] Unable to read the recovery state file:', (err as Error).message);
    return null;
  }
}

/**
 * Write the recovery state atomically. When neither the firewall policy nor the
 * proxy snapshot still needs recovering the file is removed, so a stale
 * snapshot can never be replayed on the next launch.
 */
export function writeAppState(state: AppState): void {
  const file = getAppStateFilePath();
  const hasFirewall = !!state.firewallPolicy && state.firewallPolicy.entries.length > 0;
  const hasProxy = !!state.systemProxy;

  if (!hasFirewall && !hasProxy) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // Best effort: a stale file is harmless, it is validated before use.
    }
    return;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export function mutateAppState(mutator: (state: AppState) => void): AppState {
  const state = readAppState() ?? { version: 1 };
  mutator(state);
  writeAppState(state);
  return state;
}

/** Forget the captured firewall policy (best effort — never throws). */
export function clearFirewallSection(): void {
  try {
    mutateAppState((state) => {
      delete state.armed;
      delete state.armedAt;
      delete state.firewallPolicy;
    });
  } catch (err) {
    console.warn('[KillSwitch] Could not update the recovery state file:', (err as Error).message);
  }
}

/** Forget the proxy snapshot (best effort — never throws). */
export function clearProxySection(): void {
  try {
    mutateAppState((state) => {
      delete state.systemProxy;
    });
  } catch (err) {
    console.warn('[SystemProxyManager] Could not update the recovery state file:', (err as Error).message);
  }
}

/* ------------------------------------------------------------------------ *
 * Firewall policy capture / apply / restore
 * ------------------------------------------------------------------------ */

const PROFILE_ORDER: FirewallProfile[] = ['domain', 'private', 'public'];
const POLICY_TOKEN = /^(block|allow)(inbound|outbound)$/;
const PROFILE_HEADER = /^(domain|private|public)\s+profile\b/i;
const POLICY_LINE = /firewall\s*policy\s+(.+)$/i;
const POLICY_VALUE_ONLY = /^\s*((?:block|allow)(?:inbound|outbound)\s*,\s*(?:block|allow)(?:inbound|outbound))\s*$/i;

/** Normalise `BlockInbound,AllowOutbound` → `blockinbound,allowoutbound`. */
export function normalizePolicy(value: string): string | null {
  const parts = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .split(',');
  if (parts.length !== 2 || !parts.every((part) => POLICY_TOKEN.test(part))) return null;
  return parts.join(',');
}

/**
 * Parse `netsh advfirewall show allprofiles firewallpolicy` output:
 *
 *   Domain Profile Settings:
 *   --------------------------------------------------------------------
 *   Firewall Policy                       AllowInbound,AllowOutbound
 *   ...
 *
 * The profile is taken from the `Domain/Private/Public Profile Settings:`
 * header, falling back to positional order. Localised netsh output is not
 * understood — parsing then yields nothing and arming fails closed rather than
 * guessing at a policy it cannot restore.
 */
export function parseFirewallPolicy(raw: string): FirewallPolicyEntry[] {
  const entries: FirewallPolicyEntry[] = [];
  let currentProfile: FirewallProfile | undefined;

  for (const line of raw.split(/\r?\n/)) {
    const header = PROFILE_HEADER.exec(line);
    if (header) {
      currentProfile = header[1].toLowerCase() as FirewallProfile;
      continue;
    }

    let candidate: string | undefined;
    const policyLine = POLICY_LINE.exec(line);
    if (policyLine) {
      candidate = policyLine[1];
    } else {
      const valueOnly = POLICY_VALUE_ONLY.exec(line);
      if (valueOnly) candidate = valueOnly[1];
    }
    if (!candidate) continue;

    const policy = normalizePolicy(candidate);
    if (!policy) continue;

    const profile = currentProfile ?? PROFILE_ORDER[entries.length];
    if (!profile) continue;

    entries.push({ profile, policy });
  }

  return entries;
}

export async function captureFirewallPolicy(): Promise<{ entries: FirewallPolicyEntry[]; raw: string }> {
  const { stdout } = await runCommand('netsh', ['advfirewall', 'show', 'allprofiles', 'firewallpolicy']);
  return { entries: parseFirewallPolicy(stdout), raw: stdout };
}

export async function applyFirewallPolicy(entries: FirewallPolicyEntry[]): Promise<void> {
  for (const entry of entries) {
    await runCommand('netsh', ['advfirewall', 'set', `${entry.profile}profile`, 'firewallpolicy', entry.policy]);
  }
}

async function removeRule(name: string): Promise<void> {
  try {
    await runCommand('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`, 'dir=out']);
  } catch {
    // Rule absent (or firewall not accessible) — nothing to clean up.
  }
}

async function removeAllRules(): Promise<void> {
  for (const name of ALL_RULES) await removeRule(name);
}

async function addAllowRule(name: string, extra: string[]): Promise<void> {
  await runCommand('netsh', [
    'advfirewall',
    'firewall',
    'add',
    'rule',
    `name=${name}`,
    'dir=out',
    'action=allow',
    'enable=yes',
    'profile=any',
    ...extra
  ]);
}

/**
 * `fltmc filters` requires an elevated token: non-admin it fails with
 * "Access is denied." / 0x80070005. Returns `undefined` when it cannot be told
 * (for example fltmc is unavailable), in which case netsh's own failure decides.
 */
async function probeAdminRights(): Promise<boolean | undefined> {
  try {
    await runCommand('fltmc', ['filters']);
    return true;
  } catch (err) {
    const error = err as Error & { code?: number | string; exitCode?: number | string };
    if (error.code === 'ENOENT' || error.exitCode === 'ENOENT') return undefined;
    if (
      error.exitCode === 1 ||
      error.exitCode === '1' ||
      /access is denied|0x80070005/i.test(error.message ?? '')
    ) {
      return false;
    }
    return undefined;
  }
}

/* ------------------------------------------------------------------------ *
 * KillSwitch
 * ------------------------------------------------------------------------ */

/**
 * Windows Firewall based kill switch.
 *
 * While armed, outbound traffic follows the profile default policy
 * (`blockinbound,blockoutbound`) and is allowed only for:
 *  - the VPN core process itself (it owns the encrypted tunnel),
 *  - traffic leaving through the TUN adapter,
 *  - loopback (local SOCKS/HTTP proxy ports).
 *
 * Persistence: the policy that was live before arming is written to
 * `killswitch-state.json` *before* anything is changed, so `disarm()` and
 * {@link KillSwitch.restorePreviousPolicy} can always put the machine back —
 * including after a crash. If no usable snapshot exists but outbound traffic is
 * blocked, recovery falls back to `blockinbound,allowoutbound`; a permissive
 * policy is never touched.
 *
 * Installing firewall rules requires administrator rights. When that is not
 * available (or any step fails) `arm()` returns false, rolls the policy back
 * and leaves the system untouched.
 */
export class KillSwitch {
  private static enabled = false;

  public static async arm(coreBinaryPath?: string): Promise<boolean> {
    this.enabled = false;

    if (process.platform !== 'win32') return false;

    // Without a real core process to exempt and route traffic through, a
    // block-all policy would cut the machine off the network entirely — refuse.
    if (!coreBinaryPath || !fs.existsSync(coreBinaryPath)) {
      console.warn(
        '[KillSwitch] VPN core binary not found — refusing to arm, ' +
          'because blocking traffic without a running tunnel would disconnect this machine.'
      );
      return false;
    }

    const elevated = await probeAdminRights();
    if (elevated === false) {
      console.warn(
        '[KillSwitch] Administrator rights are required to change the Windows Firewall policy — refusing to arm.'
      );
      return false;
    }

    // Recover a previous (possibly crashed) session before capturing a fresh
    // snapshot, otherwise we would snapshot our own block-all policy and lose
    // the user's real settings for good.
    try {
      await this.restorePreviousPolicy();
    } catch (err) {
      console.warn('[KillSwitch] Could not recover the previous session before arming:', (err as Error).message);
    }

    let captured: { entries: FirewallPolicyEntry[]; raw: string } | undefined;
    let policyChanged = false;

    try {
      await removeAllRules();

      captured = await captureFirewallPolicy();
      if (captured.entries.length === 0) {
        throw new Error('could not parse the current Windows Firewall policy from netsh output');
      }

      // Persist BEFORE mutating: a crash between here and disarm() must be
      // recoverable to the exact previous policy.
      mutateAppState((state) => {
        state.armed = true;
        state.armedAt = new Date().toISOString();
        state.firewallPolicy = { entries: captured!.entries, raw: captured!.raw };
      });

      await runCommand('netsh', ['advfirewall', 'set', 'allprofiles', 'firewallpolicy', KILL_SWITCH_FIREWALL_POLICY]);
      policyChanged = true;

      // Explicit allow rules DO take effect against the default policy (unlike
      // against an explicit block rule, which is why the old design was inert).
      await addAllowRule(RULE_CORE, [`program=${coreBinaryPath}`]);
      await addAllowRule(RULE_TUN, [`interface=${TUN_INTERFACE_NAME}`]);
      await addAllowRule(RULE_LOOPBACK, ['remoteip=127.0.0.1']);

      this.enabled = true;
      return true;
    } catch (err) {
      console.warn('[KillSwitch] Unable to arm firewall protection:', (err as Error).message);
      this.enabled = false;
      await removeAllRules();

      if (policyChanged && captured) {
        try {
          await applyFirewallPolicy(captured.entries);
          clearFirewallSection();
        } catch (restoreErr) {
          // Keep the state file: an elevated restart can still put the policy
          // back through restorePreviousPolicy().
          console.error(
            '[KillSwitch] CRITICAL: the firewall policy could not be rolled back (' +
              `${(restoreErr as Error).message}). The captured policy was kept in ` +
              `${getAppStateFilePath()} so it can be restored on the next launch.`
          );
        }
      } else {
        // The policy was never changed; only rule leftovers may exist.
        clearFirewallSection();
      }
      return false;
    }
  }

  public static async disarm(): Promise<boolean> {
    this.enabled = false;
    if (process.platform !== 'win32') return true;

    try {
      await removeAllRules();
      await this.restorePreviousPolicy();
      return true;
    } catch (err) {
      console.warn('[KillSwitch] Failed to restore the previous firewall policy:', (err as Error).message);
      return false;
    }
  }

  /**
   * Crash recovery, also safe to call on every startup: remove leftover rules
   * and restore the firewall policy captured by an earlier run.
   *
   * Restore rules, in order:
   *  1. a usable snapshot in the state file → apply it per profile, exactly;
   *  2. otherwise, only when outbound traffic is blocked *and* it can be
   *     attributed to RYOX (an unreadable state file, or every profile sitting
   *     on this app's own `blockinbound,blockoutbound`) → apply
   *     `blockinbound,allowoutbound`.
   *
   * A permissive policy is never modified, and neither is a hand-written
   * partial block policy, so a user's own firewall configuration survives.
   *
   * @returns true when a policy was (re)applied.
   */
  public static async restorePreviousPolicy(): Promise<boolean> {
    this.enabled = false;
    if (process.platform !== 'win32') return false;

    await removeAllRules();

    const fileExists = fs.existsSync(getAppStateFilePath());
    const state = readAppState();
    const entries = state?.firewallPolicy?.entries ?? [];
    if (entries.length > 0) {
      await applyFirewallPolicy(entries);
      clearFirewallSection();
      return true;
    }
    if (state?.firewallPolicy) clearFirewallSection();

    const live = await captureFirewallPolicy();
    if (!live.entries.some((entry) => entry.policy.endsWith('blockoutbound'))) return false;

    // Attribute the block to us before touching anything: either our state file
    // is present but unreadable, or the live policy is exactly the signature we
    // install (all profiles on blockinbound,blockoutbound).
    const ryoxSignature =
      live.entries.length > 0 && live.entries.every((entry) => entry.policy === KILL_SWITCH_FIREWALL_POLICY);
    const unreadableStateFile = fileExists && state === null;
    if (!ryoxSignature && !unreadableStateFile) return false;

    console.warn(
      '[KillSwitch] Outbound traffic is still blocked by an unfinished RYOX session and no usable recovery ' +
        `state was found — restoring the Windows default policy (${DEFAULT_FIREWALL_POLICY}).`
    );
    await runCommand('netsh', ['advfirewall', 'set', 'allprofiles', 'firewallpolicy', DEFAULT_FIREWALL_POLICY]);
    clearFirewallSection();
    return true;
  }

  public static isArmed(): boolean {
    return this.enabled;
  }
}
