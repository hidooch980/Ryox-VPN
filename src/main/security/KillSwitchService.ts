import { KillSwitch } from '../vpn/KillSwitch';

/**
 * Thin façade over {@link KillSwitch} kept for the `killswitch:enable` /
 * `killswitch:disable` IPC surface.
 *
 * Historically this class installed its own firewall rules that blocked *all*
 * outbound traffic while only allowing the local proxy ports. That also blocked
 * the VPN core's own connection to the remote node, so enabling the kill switch
 * tore the tunnel down. There is now a single implementation: the rules created
 * by `KillSwitch`, which exempt the core process, the TUN adapter and loopback.
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
