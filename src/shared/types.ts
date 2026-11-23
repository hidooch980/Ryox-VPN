export type SupportedCore = 
  | 'xray' 
  | 'sing-box' 
  | 'mihomo' 
  | 'hysteria2' 
  | 'tuic' 
  | 'wireguard' 
  | 'openvpn' 
  | 'shadowsocks';

export type SupportedProtocol = 
  | 'vless' 
  | 'vmess' 
  | 'trojan' 
  | 'shadowsocks' 
  | 'hysteria2' 
  | 'tuic' 
  | 'wireguard' 
  | 'openvpn' 
  | 'socks5' 
  | 'http';

export type ConnectionState = 
  | 'DISCONNECTED' 
  | 'CONNECTING' 
  | 'VERIFYING' 
  | 'CONNECTED' 
  | 'DISCONNECTING' 
  | 'ERROR';

export type RoutingMode = 'Rule' | 'Global' | 'Direct';
export type TunnelMode = 'TUN' | 'SystemProxy';

export interface VpnServerConfig {
  id: string;
  name: string;
  server: string;
  port: number;
  protocol: SupportedProtocol;
  core: SupportedCore;
  
  // Authentication & Keys
  uuid?: string;           // VLESS / VMess / TUIC
  password?: string;       // Trojan / Shadowsocks / Hysteria2
  method?: string;         // Shadowsocks cipher (e.g. 2022-blake3-aes-128-gcm)
  
  // Transport & TLS
  network?: 'tcp' | 'ws' | 'grpc' | 'http' | 'quic' | 'kcp';
  tls?: 'none' | 'tls' | 'reality';
  sni?: string;
  host?: string;
  path?: string;
  alpn?: string[];
  flow?: string;           // xtls-rprx-vision
  fingerprint?: string;    // chrome, safari, etc.
  
  // Reality
  publicKey?: string;      // Reality public key
  shortId?: string;        // Reality shortId
  spiderX?: string;
  
  // Wireguard specific
  privateKey?: string;
  peerPublicKey?: string;
  presharedKey?: string;
  address?: string[];
  dnsServers?: string[];
  mtu?: number;
  
  // Metadata & Metrics
  latency?: number;        // ms (-1 if unreachable)
  isFavorite?: boolean;
  countryCode?: string;
  countryName?: string;
  subscriptionId?: string;
  rawUri?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Subscription {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  updateIntervalHours: number;
  lastUpdated?: number;
  serverCount: number;
  userAgent?: string;
  error?: string;
}

export interface FreeConfigSource {
  id: string;
  name: string;
  url: string;
  maintainer: string;
  protocols: SupportedProtocol[];
  enabled: boolean;
  lastSync?: number;
  serverCount?: number;
  description: string;
  trustLevel: 'Official' | 'Community' | 'Verified';
}

export interface CoreMetadata {
  id: SupportedCore;
  name: string;
  version: string;
  latestVersion?: string;
  installed: boolean;
  status: 'Ready' | 'Missing' | 'Updating' | 'Incompatible';
  license: string;
  licenseUrl: string;
  upstreamUrl: string;
  description: string;
  category: 'Proxy Core' | 'VPN Engine' | 'Protocol Transport';
}

export interface AppSettings {
  tunnelMode: TunnelMode;
  routingMode: RoutingMode;
  autoConnectOnLaunch: boolean;
  startMinimized: boolean;
  killSwitch: boolean;
  dnsServers: string[];
  customDnsEnabled: boolean;
  dnsOverHttps: boolean;
  dohUrl: string;
  activeCore: SupportedCore;
  inboundHttpPort: number;
  inboundSocksPort: number;
  allowLan: boolean;
  bypassChinaAndIranLan: boolean;
  bypassPrivateIps: boolean;
  selectedServerId?: string;
  theme: 'dark' | 'light' | 'cyberpunk';
  accentColor: string;
}

export interface LiveStats {
  connectionState: ConnectionState;
  activeServer?: VpnServerConfig;
  activeCore: SupportedCore;
  uploadSpeed: number;     // bytes per second
  downloadSpeed: number;   // bytes per second
  totalUpload: number;     // total bytes in session
  totalDownload: number;   // total bytes in session
  sessionDuration: number; // seconds
  pingMs: number;          // active ping to ping server
  clientIp?: string;
  clientCountry?: string;
  clientCity?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  source: string;
  message: string;
}

export interface DiagnosticsResult {
  dnsLeakDetected: boolean;
  currentPublicIp?: string;
  country?: string;
  isp?: string;
  pingLatency: number;
  tcpHandshakeMs: number;
  tunAdapterStatus: 'Active' | 'Inactive' | 'Error';
  timestamp: number;
}
