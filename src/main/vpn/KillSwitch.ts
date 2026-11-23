import { execFile } from 'child_process';
import * as fs from 'fs';

const RULE_BLOCK = 'RYOX-KillSwitch-BlockAll';
const RULE_CORE = 'RYOX-KillSwitch-AllowCore';
const RULE_TUN = 'RYOX-KillSwitch-AllowTun';
const RULE_LOOPBACK = 'RYOX-KillSwitch-AllowLoopback';

const TUN_INTERFACE_NAME = 'ryox-tun';
const NETS_TIMEOUT_MS = 15000;

function netsh(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('netsh', args, { timeout: NETS_TIMEOUT_MS, windowsHide: true }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`${stderr || error.message}`.trim()));
        return;
      }
      resolve();
    });
  });
}

async function removeRule(name: string): Promise<void> {
  try {
    await netsh(['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`, 'dir=out']);
  } catch {
    // Rule absent (or firewall not accessible) — nothing to clean up.
  }
}

/**
 * Windows Firewall based kill switch.
 *
 * While armed, all outbound traffic is blocked except:
 *  - the VPN core process itself (it owns the encrypted tunnel and any
 *    direct/bypass outbounds),
 *  - traffic leaving through the TUN adapter,
 *  - loopback (local SOCKS/HTTP proxy ports).
 *
 * Installing firewall rules requires administrator rights. When that is not
 * available `arm()` returns false and leaves the system untouched, so the UI
 * can report the real state instead of faking protection.
 */
export class KillSwitch {
  private static enabled = false;

  public static async arm(coreBinaryPath?: string): Promise<boolean> {
    if (process.platform !== 'win32') {
      this.enabled = false;
      return false;
    }

    // Without a real core process to exempt and route traffic through, a
    // block-all rule would cut the machine off the network entirely — refuse.
    if (!coreBinaryPath || !fs.existsSync(coreBinaryPath)) {
      console.warn(
        '[KillSwitch] VPN core binary not found — refusing to arm, ' +
          'because blocking traffic without a running tunnel would disconnect this machine.'
      );
      this.enabled = false;
      return false;
    }

    try {
      // Remove leftovers from a previous (possibly crashed) session first.
      await this.disarm();

      await netsh([
        'advfirewall',
        'firewall',
        'add',
        'rule',
        `name=${RULE_BLOCK}`,
        'dir=out',
        'action=block',
        'enable=yes',
        'profile=any'
      ]);

      await netsh([
        'advfirewall',
        'firewall',
        'add',
        'rule',
        `name=${RULE_CORE}`,
        'dir=out',
        'action=allow',
        `program=${coreBinaryPath}`,
        'enable=yes',
        'profile=any'
      ]);

      await netsh([
        'advfirewall',
        'firewall',
        'add',
        'rule',
        `name=${RULE_TUN}`,
        'dir=out',
        'action=allow',
        `interface=${TUN_INTERFACE_NAME}`,
        'enable=yes',
        'profile=any'
      ]);

      await netsh([
        'advfirewall',
        'firewall',
        'add',
        'rule',
        `name=${RULE_LOOPBACK}`,
        'dir=out',
        'action=allow',
        'remoteip=127.0.0.1',
        'enable=yes',
        'profile=any'
      ]);

      this.enabled = true;
      return true;
    } catch (err) {
      console.warn('[KillSwitch] Unable to arm firewall protection:', (err as Error).message);
      // Never leave a half-applied block rule behind: it would cut the machine
      // off from the network without any tunnel to protect.
      await this.disarm();
      this.enabled = false;
      return false;
    }
  }

  public static async disarm(): Promise<boolean> {
    this.enabled = false;
    if (process.platform !== 'win32') return true;

    await removeRule(RULE_BLOCK);
    await removeRule(RULE_CORE);
    await removeRule(RULE_TUN);
    await removeRule(RULE_LOOPBACK);
    return true;
  }

  public static isArmed(): boolean {
    return this.enabled;
  }
}
