import { KillSwitch } from '../vpn/KillSwitch';

/**
 * Thin façade over {@link KillSwitch} kept for the `killswitch:enable` /
 * `killswitch:disable` IPC surface. It holds no logic of its own.
 *
 * The single implementation lives in `KillSwitch`: while armed, the Windows
 * Firewall *default* policy becomes `blockinbound,blockoutbound` and explicit
 * allow rules exempt the VPN core process, the TUN adapter and loopback.
 * (The older design installed an explicit `action=block` catch-all rule, which
 * Windows evaluates before allow rules, so the exemptions were inert and the
 * core could not reach the node at all.)
 */
export class KillSwitchService {
  /** Path of the VPN core executable to exempt from the block rule. */
  private coreBinaryPath?: string;

  public setCoreBinaryPath(binaryPath?: string): void {
    this.coreBinaryPath = binaryPath;
  }

  public async enable(): Promise<boolean> {
    return KillSwitch.arm(this.coreBinaryPath);
  }

  public async disable(): Promise<void> {
    await KillSwitch.disarm();
  }

  /** Returns whether the kill switch firewall rules are currently active. */
  public isEnabled(): boolean {
    return KillSwitch.isArmed();
  }
}
