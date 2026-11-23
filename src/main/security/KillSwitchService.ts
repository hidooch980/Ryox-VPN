import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Windows Firewall Kill Switch — blocks all outbound traffic except the
 * local proxy ports (10808, 10809) while enabled.
 *
 * All arguments passed to execFile are hard-coded literals; no user input
 * is ever interpolated into the command line, preventing shell injection.
 * shell: true is intentionally NOT used.
 */
export class KillSwitchService {
  private enabled = false;

  /**
   * Installs two Windows Firewall rules:
   *  1. RYOX-KillSwitch      — block ALL outbound traffic
   *  2. RYOX-KillSwitch-Allow — allow outbound on TCP 10808 and 10809 (proxy ports)
   */
  public async enable(): Promise<void> {
    // Block all outbound traffic
    await execFileAsync('netsh', [
      'advfirewall',
      'firewall',
      'add',
      'rule',
      'name=RYOX-KillSwitch',
      'dir=out',
      'action=block',
    ]);

    // Allow outbound on local proxy ports so the proxy core can still reach its endpoints
    await execFileAsync('netsh', [
      'advfirewall',
      'firewall',
      'add',
      'rule',
      'name=RYOX-KillSwitch-Allow',
      'dir=out',
      'action=allow',
      'localport=10808,10809',
      'protocol=tcp',
    ]);

    this.enabled = true;
  }

  /**
   * Removes both RYOX kill-switch firewall rules, restoring normal connectivity.
   */
  public async disable(): Promise<void> {
    // Remove the block rule (errors are caught individually so both always run)
    try {
      await execFileAsync('netsh', [
        'advfirewall',
        'firewall',
        'delete',
        'rule',
        'name=RYOX-KillSwitch',
      ]);
    } catch (err) {
      console.warn('[KillSwitchService] Failed to remove RYOX-KillSwitch rule:', err);
    }

    try {
      await execFileAsync('netsh', [
        'advfirewall',
        'firewall',
        'delete',
        'rule',
        'name=RYOX-KillSwitch-Allow',
      ]);
    } catch (err) {
      console.warn('[KillSwitchService] Failed to remove RYOX-KillSwitch-Allow rule:', err);
    }

    this.enabled = false;
  }

  /** Returns whether the kill switch firewall rules are currently active. */
  public isEnabled(): boolean {
    return this.enabled;
  }
}
