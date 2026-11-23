import * as crypto from 'crypto';

export interface AppReleaseInfo {
  version: string;
  releaseDate: string;
  changelog: string;
  downloadUrl?: string;
  sha256?: string;
  hasUpdate: boolean;
}

export class AppUpdater {
  private static currentVersion = '1.0.0';

  public static getCurrentVersion(): string {
    return this.currentVersion;
  }

  public static async checkForUpdates(): Promise<AppReleaseInfo> {
    try {
      const res = await fetch('https://api.github.com/repos/hidooch980/Ryox-VPN/releases/latest', {
        headers: {
          'User-Agent': 'RYOX-VPN-Updater/1.0.0',
          'Accept': 'application/vnd.github.v3+json'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        // Return latest simulated release if repository is private or offline
        return {
          version: this.currentVersion,
          releaseDate: new Date().toISOString(),
          changelog: 'You are running the latest stable release of RYOX VPN v1.0.0.',
          hasUpdate: false
        };
      }

      const data = await res.json();
      const latestTag = data.tag_name ? data.tag_name.replace(/^v/, '') : this.currentVersion;
      const hasUpdate = this.compareVersions(latestTag, this.currentVersion) > 0;

      // Find Windows or Android asset
      const asset = data.assets?.find((a: any) => a.name.includes('.exe') || a.name.includes('.apk') || a.name.includes('.zip'));

      return {
        version: latestTag,
        releaseDate: data.published_at || new Date().toISOString(),
        changelog: data.body || 'Performance improvements and security updates.',
        downloadUrl: asset?.browser_download_url,
        hasUpdate
      };

    } catch {
      return {
        version: this.currentVersion,
        releaseDate: new Date().toISOString(),
        changelog: 'Offline or up to date.',
        hasUpdate: false
      };
    }
  }

  public static verifyFileChecksum(fileBuffer: Buffer, expectedSha256: string): boolean {
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    return hash.toLowerCase() === expectedSha256.toLowerCase();
  }

  private static compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(p => parseInt(p, 10) || 0);
    const parts2 = v2.split('.').map(p => parseInt(p, 10) || 0);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const a = parts1[i] || 0;
      const b = parts2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }
}
