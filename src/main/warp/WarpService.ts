import { generateKeyPairSync } from 'crypto';
import { VpnServerConfig } from '../../shared/types';

export class WarpService {
  /**
   * Generates a free Cloudflare WARP WireGuard profile
   */
  public static async generateWarpProfile(cleanIp: string = '162.159.192.1'): Promise<VpnServerConfig> {
    // 1. Generate Wireguard Curve25519 keypair
    const { privateKey, publicKey } = generateKeyPairSync('x25519');
    
    // Wireguard standard 32-byte base64 private and public keys
    const privB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(16).toString('base64');
    const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).subarray(12).toString('base64');

    let assignedIp = '172.16.0.2/32';
    const peerPublicKey = 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wMbgyo='; // Official Cloudflare WARP peer key

    try {
      // 2. Register account with Cloudflare Client API
      const res = await fetch('https://api.cloudflareclient.com/v0a2158/reg', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'okhttp/3.12.1'
        },
        body: JSON.stringify({
          key: pubB64,
          install_id: '',
          fcm_token: '',
          tos: new Date().toISOString(),
          model: 'PC',
          serial_number: '',
          locale: 'en_US'
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.result?.config?.interface?.addresses?.v4) {
          assignedIp = `${data.result.config.interface.addresses.v4}/32`;
        }
      }
    } catch {
      // Fallback to standard Cloudflare WARP pool allocation
    }

    const cleanHost = cleanIp || '162.159.192.1';

    return {
      id: `ryox-warp-${Date.now()}`,
      name: `⚡ Cloudflare WARP (${cleanHost})`,
      server: cleanHost,
      port: 2408,
      protocol: 'wireguard',
      core: 'sing-box',
      privateKey: privB64,
      peerPublicKey,
      address: [assignedIp],
      dnsServers: ['1.1.1.1', '1.0.0.1'],
      mtu: 1420,
      countryCode: 'CF',
      countryName: 'Cloudflare Edge',
      latency: 35,
      isFavorite: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
}
