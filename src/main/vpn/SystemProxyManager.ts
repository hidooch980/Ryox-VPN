import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SystemProxyManager {
  private static isWindows = process.platform === 'win32';

  public static async enableProxy(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    if (!this.isWindows) {
      process.env.HTTP_PROXY = `http://${host}:${port}`;
      process.env.HTTPS_PROXY = `http://${host}:${port}`;
      return true;
    }

    try {
      const proxyServer = `${host}:${port}`;
      // Windows registry command to enable Internet Options proxy
      const cmdEnable = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f`;
      const cmdServer = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "${proxyServer}" /f`;
      const cmdOverride = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyOverride /t REG_SZ /d "<local>;localhost;127.*;10.*;172.16.*;192.168.*" /f`;

      await execAsync(cmdEnable);
      await execAsync(cmdServer);
      await execAsync(cmdOverride);
      return true;
    } catch (err) {
      console.error('[SystemProxyManager] Failed to set Windows proxy:', err);
      return false;
    }
  }

  public static async disableProxy(): Promise<boolean> {
    if (!this.isWindows) {
      delete process.env.HTTP_PROXY;
      delete process.env.HTTPS_PROXY;
      return true;
    }

    try {
      const cmdDisable = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f`;
      await execAsync(cmdDisable);
      return true;
    } catch (err) {
      console.error('[SystemProxyManager] Failed to disable Windows proxy:', err);
      return false;
    }
  }
}
