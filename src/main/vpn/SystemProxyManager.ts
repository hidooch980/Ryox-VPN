import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class SystemProxyManager {
  private static isWindows = process.platform === 'win32';

  public static async enableProxy(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    // Sanitize input to prevent injection
    const cleanPort = Math.floor(Number(port));
    if (isNaN(cleanPort) || cleanPort < 1 || cleanPort > 65535) {
      console.error('[SystemProxyManager] Invalid port:', port);
      return false;
    }

    const cleanHost = host.replace(/[^a-zA-Z0-9\.\-_]/g, '') || '127.0.0.1';

    if (!this.isWindows) {
      process.env.HTTP_PROXY = `http://${cleanHost}:${cleanPort}`;
      process.env.HTTPS_PROXY = `http://${cleanHost}:${cleanPort}`;
      return true;
    }

    try {
      const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
      const proxyServer = `${cleanHost}:${cleanPort}`;

      // Execute directly via reg.exe with sanitized parameter array (Zero shell injection risk)
      await execFileAsync('reg', ['add', regKey, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f']);
      await execFileAsync('reg', ['add', regKey, '/v', 'ProxyServer', '/t', 'REG_SZ', '/d', proxyServer, '/f']);
      await execFileAsync('reg', ['add', regKey, '/v', 'ProxyOverride', '/t', 'REG_SZ', '/d', '<local>;localhost;127.*;10.*;172.16.*;192.168.*', '/f']);
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
      const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
      await execFileAsync('reg', ['add', regKey, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f']);
      return true;
    } catch (err) {
      console.error('[SystemProxyManager] Failed to disable Windows proxy:', err);
      return false;
    }
  }
}
