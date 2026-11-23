import { SupportedCore } from '../../shared/types';
import * as crypto from 'crypto';

export interface CoreReleaseInfo {
  core: SupportedCore;
  version: string;
  downloadUrl: string;
  archiveName: string;
}

export class CoreUpdater {
  private static coreRepos: Record<string, string> = {
    'sing-box': 'SagerNet/sing-box',
    'xray': 'XTLS/Xray-core',
    'mihomo': 'MetaCubeX/mihomo',
    'hysteria2': 'apernet/hysteria'
  };

  public static async fetchLatestCoreRelease(core: SupportedCore): Promise<CoreReleaseInfo | null> {
    const repo = this.coreRepos[core];
    if (!repo) return null;

    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: {
          'User-Agent': 'RYOX-VPN-Core-Updater/1.0.0',
          'Accept': 'application/vnd.github.v3+json'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) return null;
      const data = await res.json();
      const version = data.tag_name ? data.tag_name.replace(/^v/, '') : 'latest';

      const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
      const os = process.platform === 'win32' ? 'windows' : 'linux';

      const asset = data.assets?.find((a: any) => {
        const name = a.name.toLowerCase();
        return name.includes(os) && (name.includes(arch) || name.includes('x86_64')) && (name.endsWith('.zip') || name.endsWith('.tar.gz'));
      });

      if (!asset) return null;

      return {
        core,
        version,
        downloadUrl: asset.browser_download_url,
        archiveName: asset.name
      };

    } catch {
      return null;
    }
  }

  public static verifySha256(data: Buffer, expectedSha256: string): boolean {
    const calculated = crypto.createHash('sha256').update(data).digest('hex');
    return calculated.toLowerCase() === expectedSha256.toLowerCase();
  }
}
