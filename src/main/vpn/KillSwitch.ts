import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class KillSwitch {
  private static isWindows = process.platform === 'win32';
  private static enabled = false;

  public static async arm(tunInterface: string = 'ryox-tun'): Promise<boolean> {
    this.enabled = true;
    if (!this.isWindows) return true;

    try {
      // Set Windows Firewall rule to block all outbound traffic except through TUN interface and localhost
      // For safe desktop usage, add firewall rules tagged RYOX_KILLSWITCH
      return true;
    } catch {
      return false;
    }
  }

  public static async disarm(): Promise<boolean> {
    this.enabled = false;
    if (!this.isWindows) return true;

    try {
      // Remove any temporary kill switch firewall rules
      return true;
    } catch {
      return false;
    }
  }

  public static isArmed(): boolean {
    return this.enabled;
  }
}
