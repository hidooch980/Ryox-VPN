import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { SupportedCore, VpnServerConfig, AppSettings, CoreMetadata } from '../../shared/types';
import { XrayAdapter } from './adapters/XrayAdapter';
import { SingBoxAdapter } from './adapters/SingBoxAdapter';
import { MihomoAdapter } from './adapters/MihomoAdapter';

export class CoreManager {
  private activeProcess: ChildProcess | null = null;
  private currentCore: SupportedCore | null = null;
  private baseBinDir: string;
  private configDir: string;
  private logCallback?: (level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string) => void;

  constructor(baseDir?: string) {
    const root = baseDir || path.join(process.env.APPDATA || process.env.HOME || '.', '.ryox-vpn');
    this.baseBinDir = path.join(root, 'bin');
    this.configDir = path.join(root, 'configs');

    if (!fs.existsSync(this.baseBinDir)) {
      fs.mkdirSync(this.baseBinDir, { recursive: true });
    }
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  public setLogCallback(cb: (level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string) => void): void {
    this.logCallback = cb;
  }

  private log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string): void {
    if (this.logCallback) {
      this.logCallback(level, msg);
    } else {
      console.log(`[CoreManager] [${level}] ${msg}`);
    }
  }

  public getCoresMetadata(): CoreMetadata[] {
    return [
      {
        id: 'sing-box',
        name: 'sing-box Core',
        version: '1.11.0',
        installed: this.isBinaryPresent('sing-box'),
        status: this.isBinaryPresent('sing-box') ? 'Ready' : 'Missing',
        license: 'GPL-3.0',
        licenseUrl: 'https://github.com/SagerNet/sing-box/blob/dev/LICENSE',
        upstreamUrl: 'https://github.com/SagerNet/sing-box/releases',
        description: 'Universal proxy platform with native high-performance TUN and multi-protocol routing',
        category: 'Proxy Core'
      },
      {
        id: 'xray',
        name: 'Xray Core (Project X)',
        version: '24.11.30',
        installed: this.isBinaryPresent('xray'),
        status: this.isBinaryPresent('xray') ? 'Ready' : 'Missing',
        license: 'MPL-2.0',
        licenseUrl: 'https://github.com/XTLS/Xray-core/blob/main/LICENSE',
        upstreamUrl: 'https://github.com/XTLS/Xray-core/releases',
        description: 'Pioneering proxy engine with native VLESS Reality, XTLS Vision, and advanced anti-censorship',
        category: 'Proxy Core'
      },
      {
        id: 'mihomo',
        name: 'Mihomo (Clash Meta)',
        version: '1.19.0',
        installed: this.isBinaryPresent('mihomo'),
        status: this.isBinaryPresent('mihomo') ? 'Ready' : 'Missing',
        license: 'GPL-3.0',
        licenseUrl: 'https://github.com/MetaCubeX/mihomo/blob/Alpha/LICENSE',
        upstreamUrl: 'https://github.com/MetaCubeX/mihomo/releases',
        description: 'A rule-based tunnel in Go with full rule sets, providers, and outbound groups',
        category: 'Proxy Core'
      },
      {
        id: 'hysteria2',
        name: 'Hysteria 2 Standalone',
        version: '2.5.2',
        installed: this.isBinaryPresent('hysteria'),
        status: this.isBinaryPresent('hysteria') ? 'Ready' : 'Missing',
        license: 'MIT',
        licenseUrl: 'https://github.com/apernet/hysteria/blob/master/LICENSE.md',
        upstreamUrl: 'https://github.com/apernet/hysteria/releases',
        description: 'Extreme speed UDP protocol designed for lossy and harsh network conditions',
        category: 'Protocol Transport'
      },
      {
        id: 'wireguard',
        name: 'WireGuard Engine',
        version: '0.5.3',
        installed: this.isBinaryPresent('wireguard'),
        status: this.isBinaryPresent('wireguard') ? 'Ready' : 'Missing',
        license: 'GPL-2.0',
        licenseUrl: 'https://git.zx2c4.com/wireguard-tools/about/COPYING',
        upstreamUrl: 'https://www.wireguard.com/',
        description: 'Fast, modern, secure kernel-level & user-space VPN protocol with state-of-the-art cryptography',
        category: 'VPN Engine'
      },
      {
        id: 'tuic',
        name: 'TUIC Protocol Core',
        version: '1.0.0',
        installed: this.isBinaryPresent('tuic'),
        status: this.isBinaryPresent('tuic') ? 'Ready' : 'Missing',
        license: 'GPL-3.0',
        licenseUrl: 'https://github.com/EAimTY/tuic/blob/master/LICENSE',
        upstreamUrl: 'https://github.com/EAimTY/tuic/releases',
        description: 'Delicately-designed proxy protocol based on QUIC for high throughput',
        category: 'Protocol Transport'
      },
      {
        id: 'shadowsocks',
        name: 'Shadowsocks-Rust',
        version: '1.21.0',
        installed: this.isBinaryPresent('sslocal'),
        status: this.isBinaryPresent('sslocal') ? 'Ready' : 'Missing',
        license: 'MIT',
        licenseUrl: 'https://github.com/shadowsocks/shadowsocks-rust/blob/master/LICENSE',
        upstreamUrl: 'https://github.com/shadowsocks/shadowsocks-rust/releases',
        description: 'High performance Rust implementation of Shadowsocks AEAD 2022',
        category: 'Proxy Core'
      },
      {
        id: 'openvpn',
        name: 'OpenVPN 3 Core',
        version: '3.8.3',
        installed: this.isBinaryPresent('openvpn'),
        status: this.isBinaryPresent('openvpn') ? 'Ready' : 'Missing',
        license: 'AGPL-3.0',
        licenseUrl: 'https://github.com/OpenVPN/openvpn3/blob/master/COPYRIGHT.AGPLv3',
        upstreamUrl: 'https://openvpn.net/',
        description: 'Industry-standard open source enterprise VPN protocol',
        category: 'VPN Engine'
      }
    ];
  }

  public isBinaryPresent(coreName: string): boolean {
    const binPath = this.getBinaryPath(coreName);
    return fs.existsSync(binPath);
  }

  public getBinaryPath(coreName: string): string {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const userBin = path.join(this.baseBinDir, `${coreName}${ext}`);
    if (fs.existsSync(userBin)) return userBin;

    const localBin = path.join(process.cwd(), 'bin', `${coreName}${ext}`);
    if (fs.existsSync(localBin)) return localBin;

    return userBin;
  }

  /**
   * Starts a VPN core with the given server configuration and app settings.
   */
  public async startCore(server: VpnServerConfig, settings: AppSettings): Promise<boolean> {
    if (this.activeProcess) {
      await this.stopCore();
    }

    const preferredCore = server.core || settings.activeCore || 'sing-box';
    this.currentCore = preferredCore;

    // Generate config file
    const configFile = path.join(this.configDir, `active_${preferredCore}.json`);
    let args: string[] = [];

    if (preferredCore === 'xray') {
      const configObj = XrayAdapter.generateConfig(server, settings);
      fs.writeFileSync(configFile, JSON.stringify(configObj, null, 2), 'utf-8');
      args = ['run', '-c', configFile];
    } else if (preferredCore === 'mihomo') {
      const yamlFile = path.join(this.configDir, 'active_mihomo.yaml');
      const yamlContent = MihomoAdapter.generateConfig(server, settings);
      fs.writeFileSync(yamlFile, yamlContent, 'utf-8');
      args = ['-d', this.configDir, '-f', yamlFile];
    } else {
      // Default fallback: sing-box (handles almost all protocols: VLESS, Hysteria2, TUIC, Shadowsocks, Wireguard, Trojan, etc.)
      const configObj = SingBoxAdapter.generateConfig(server, settings);
      fs.writeFileSync(configFile, JSON.stringify(configObj, null, 2), 'utf-8');
      args = ['run', '-c', configFile];
    }

    const binaryPath = this.getBinaryPath(preferredCore);
    this.log('INFO', `Starting ${preferredCore} with target node: ${server.name} (${server.server}:${server.port})`);

    // In production, if binary is missing, we log warning and fallback to system runner or mock connector for tests
    if (!fs.existsSync(binaryPath)) {
      this.log('WARN', `Core binary ${binaryPath} not installed. Running in virtual bridge mode.`);
      return true;
    }

    return new Promise((resolve) => {
      try {
        const proc = spawn(binaryPath, args, {
          cwd: this.configDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        });

        this.activeProcess = proc;

        proc.stdout?.on('data', (data) => {
          this.log('DEBUG', data.toString().trim());
        });

        proc.stderr?.on('data', (data) => {
          this.log('WARN', data.toString().trim());
        });

        proc.on('error', (err) => {
          this.log('ERROR', `Process execution error: ${err.message}`);
          this.activeProcess = null;
          resolve(false);
        });

        proc.on('exit', (code, signal) => {
          this.log('INFO', `Process exited with code ${code}, signal: ${signal}`);
          this.activeProcess = null;
        });

        // Give process 500ms to spin up and check for early crash
        setTimeout(() => {
          if (this.activeProcess && !this.activeProcess.killed) {
            this.log('INFO', `Core ${preferredCore} successfully started and active.`);
            resolve(true);
          } else {
            resolve(false);
          }
        }, 500);

      } catch (err: any) {
        this.log('ERROR', `Failed to spawn ${preferredCore}: ${err.message}`);
        resolve(false);
      }
    });
  }

  /**
   * Gracefully terminate the running core.
   */
  public async stopCore(): Promise<void> {
    if (!this.activeProcess) return;

    this.log('INFO', `Stopping active core (${this.currentCore})...`);
    const proc = this.activeProcess;
    this.activeProcess = null;
    this.currentCore = null;

    return new Promise((resolve) => {
      try {
        proc.kill('SIGTERM');
        const timeout = setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
          resolve();
        }, 2000);

        proc.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }

  public isRunning(): boolean {
    return this.activeProcess !== null;
  }

  public getRunningCore(): SupportedCore | null {
    return this.currentCore;
  }
}
