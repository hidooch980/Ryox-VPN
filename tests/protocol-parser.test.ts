import { describe, it, expect } from 'vitest';
import { ProtocolParser } from '../src/main/protocol/parser';

describe('ProtocolParser', () => {
  it('should parse VLESS with Reality and XTLS Vision correctly', () => {
    const uri = 'vless://d3b07384-d113-494a-a0e2-e1c5188f58b0@us1.edge.ryoxvpn.org:443?type=tcp&security=reality&pbk=6j_S1-n8vU3gR13k5lq0bFqA0C9Z6-Z1yA0pP1k7l_8&sid=6ba85580&sni=www.microsoft.com&fp=chrome&flow=xtls-rprx-vision#US-Reality-1';
    const config = ProtocolParser.parseUri(uri);

    expect(config).not.toBeNull();
    expect(config?.protocol).toBe('vless');
    expect(config?.server).toBe('us1.edge.ryoxvpn.org');
    expect(config?.port).toBe(443);
    expect(config?.uuid).toBe('d3b07384-d113-494a-a0e2-e1c5188f58b0');
    expect(config?.tls).toBe('reality');
    expect(config?.publicKey).toBe('6j_S1-n8vU3gR13k5lq0bFqA0C9Z6-Z1yA0pP1k7l_8');
    expect(config?.shortId).toBe('6ba85580');
    expect(config?.sni).toBe('www.microsoft.com');
    expect(config?.flow).toBe('xtls-rprx-vision');
    expect(config?.name).toBe('US-Reality-1');
  });

  it('should parse VMess JSON base64 correctly', () => {
    const vmessObj = {
      v: "2",
      ps: "DE-VMess-Node",
      add: "de.ryoxvpn.org",
      port: "443",
      id: "b831381d-6324-4d53-ad4f-8cda48b30811",
      aid: "0",
      net: "ws",
      type: "none",
      host: "de.ryoxvpn.org",
      path: "/vmess",
      tls: "tls"
    };
    const b64 = Buffer.from(JSON.stringify(vmessObj)).toString('base64');
    const uri = `vmess://${b64}`;

    const config = ProtocolParser.parseUri(uri);
    expect(config).not.toBeNull();
    expect(config?.protocol).toBe('vmess');
    expect(config?.server).toBe('de.ryoxvpn.org');
    expect(config?.port).toBe(443);
    expect(config?.uuid).toBe('b831381d-6324-4d53-ad4f-8cda48b30811');
    expect(config?.network).toBe('ws');
    expect(config?.tls).toBe('tls');
    expect(config?.name).toBe('DE-VMess-Node');
  });

  it('should parse Trojan URI correctly', () => {
    const uri = 'trojan://securepass123@jp.ryoxvpn.org:443?sni=yahoo.co.jp&type=tcp#Tokyo-Trojan';
    const config = ProtocolParser.parseUri(uri);

    expect(config).not.toBeNull();
    expect(config?.protocol).toBe('trojan');
    expect(config?.server).toBe('jp.ryoxvpn.org');
    expect(config?.password).toBe('securepass123');
    expect(config?.sni).toBe('yahoo.co.jp');
    expect(config?.name).toBe('Tokyo-Trojan');
  });

  it('should parse Shadowsocks URI correctly', () => {
    const userinfo = Buffer.from('chacha20-ietf-poly1305:mypassword').toString('base64');
    const uri = `ss://${userinfo}@sg.ryoxvpn.org:8388#Singapore-SS`;
    const config = ProtocolParser.parseUri(uri);

    expect(config).not.toBeNull();
    expect(config?.protocol).toBe('shadowsocks');
    expect(config?.server).toBe('sg.ryoxvpn.org');
    expect(config?.port).toBe(8388);
    expect(config?.method).toBe('chacha20-ietf-poly1305');
    expect(config?.password).toBe('mypassword');
  });

  it('should parse Hysteria 2 URI correctly', () => {
    const uri = 'hy2://hy2secret@fr.ryoxvpn.org:8443?sni=apple.com#Paris-Hy2';
    const config = ProtocolParser.parseUri(uri);

    expect(config).not.toBeNull();
    expect(config?.protocol).toBe('hysteria2');
    expect(config?.server).toBe('fr.ryoxvpn.org');
    expect(config?.port).toBe(8443);
    expect(config?.password).toBe('hy2secret');
    expect(config?.sni).toBe('apple.com');
  });

  it('should parse multi-line and base64 subscriptions correctly', () => {
    const lines = [
      'trojan://pass1@s1.com:443#Node1',
      'trojan://pass2@s2.com:443#Node2'
    ].join('\n');

    // Test raw multi-line
    const parsedRaw = ProtocolParser.parseSubscription(lines, 'test-sub');
    expect(parsedRaw.length).toBe(2);
    expect(parsedRaw[0].name).toBe('Node1');
    expect(parsedRaw[1].name).toBe('Node2');

    // Test base64 wrapped
    const b64 = Buffer.from(lines).toString('base64');
    const parsedB64 = ProtocolParser.parseSubscription(b64, 'test-sub');
    expect(parsedB64.length).toBe(2);
  });

  // --- Regression tests for the proven parser defects (D1, D2, D3, D4, D8) ---

  it('decodes an unpadded base64 subscription body (D1 probe)', () => {
    // Node decodes this 30-char unpadded payload to "trojan://p@s.com:443#N".
    const parsed = ProtocolParser.parseSubscription('dHJvamFuOi8vcEBzLmNvbTo0NDMjTg', 'sub-unpadded');

    expect(parsed).toHaveLength(1);
    expect(parsed[0].protocol).toBe('trojan');
    expect(parsed[0].server).toBe('s.com');
    expect(parsed[0].port).toBe(443);
    expect(parsed[0].password).toBe('p');
    expect(parsed[0].name).toBe('N');
    expect(parsed[0].subscriptionId).toBe('sub-unpadded');
  });

  it('decodes a URL-safe, unpadded base64 subscription body', () => {
    const lines = 'trojan://pass@example.com:443#A' + '>'.repeat(20);
    const standard = Buffer.from(lines, 'utf-8').toString('base64');
    expect(/[+/]/.test(standard)).toBe(true);

    const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(/[-_]/.test(urlSafe)).toBe(true);

    const parsed = ProtocolParser.parseSubscription(urlSafe, 'sub-urlsafe');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].server).toBe('example.com');
    expect(parsed[0].port).toBe(443);
  });

  it('decodes a multi-line base64 body with the padding stripped', () => {
    const lines = ['trojan://p1@s1.com:443#N1', 'trojan://p2@s2.com:8443#N2'].join('\n');
    const b64 = Buffer.from(lines, 'utf-8').toString('base64').replace(/=+$/, '');

    const parsed = ProtocolParser.parseSubscription(b64, 'sub-ml');
    expect(parsed).toHaveLength(2);
    expect(parsed.map(c => c.name)).toEqual(['N1', 'N2']);
  });

  it('rejects a node whose port is missing or out of range (D2)', () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    expect(ProtocolParser.parseUri(`vless://${uuid}@h.example.com`)).toBeNull();
    expect(ProtocolParser.parseUri(`vless://${uuid}@h.example.com:0`)).toBeNull();
    expect(ProtocolParser.parseUri(`vless://${uuid}@h.example.com:70000`)).toBeNull();
    expect(ProtocolParser.parseUri(`trojan://pass@h.example.com:#x`)).toBeNull();
  });

  it('decodes unpadded Shadowsocks userinfo and keeps a password containing ":" (D3)', () => {
    const unpadded = Buffer.from('aes-256-gcm:password').toString('base64').replace(/=+$/, '');
    expect(unpadded).toBe('YWVzLTI1Ni1nY206cGFzc3dvcmQ');

    const simple = ProtocolParser.parseUri(`ss://${unpadded}@h.example.com:8388#SS`);
    expect(simple).not.toBeNull();
    expect(simple?.method).toBe('aes-256-gcm');
    expect(simple?.password).toBe('password');

    const colon = Buffer.from('aes-256-gcm:pa:ss:word').toString('base64').replace(/=+$/, '');
    const withColon = ProtocolParser.parseUri(`ss://${colon}@h.example.com:443#SS`);
    expect(withColon).not.toBeNull();
    expect(withColon?.method).toBe('aes-256-gcm');
    expect(withColon?.password).toBe('pa:ss:word');
  });

  it('rejects Shadowsocks userinfo with no method:password separator (D3)', () => {
    // "cGFzc3dvcmQ" decodes to the bare word "password" — no method, no password.
    expect(ProtocolParser.parseUri('ss://cGFzc3dvcmQ@h.example.com:443#SS')).toBeNull();
  });

  it('maps Clash ss/socks aliases and selects the correct core (D4)', () => {
    const clash = [
      'proxies:',
      '  - name: SS-Node',
      '    type: ss',
      '    server: ss.example.com',
      '    port: 8388',
      '    cipher: aes-256-gcm',
      '    password: secret',
      '  - name: HY2-Node',
      '    type: hysteria2',
      '    server: hy2.example.com',
      '    port: 443',
      '    password: pass',
      '  - name: SOCKS-Node',
      '    type: socks',
      '    server: socks.example.com',
      '    port: 1080',
    ].join('\n');

    const parsed = ProtocolParser.parseSubscription(clash, 'clash-sub');
    expect(parsed).toHaveLength(3);

    const ss = parsed.find(p => p.name === 'SS-Node');
    expect(ss?.protocol).toBe('shadowsocks');
    expect(ss?.core).toBe('xray');

    const hy2 = parsed.find(p => p.name === 'HY2-Node');
    expect(hy2?.protocol).toBe('hysteria2');
    expect(hy2?.core).toBe('sing-box');

    const socks = parsed.find(p => p.name === 'SOCKS-Node');
    expect(socks?.protocol).toBe('socks5');
    expect(socks?.core).toBe('sing-box');
  });

  it('keeps a node name containing a literal "%" instead of dropping the node (D8)', () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    const vless = ProtocolParser.parseUri(`vless://${uuid}@h.example.com:443#100%`);
    expect(vless).not.toBeNull();
    expect(vless?.name).toBe('100%');

    const ss = ProtocolParser.parseUri('ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ@h.example.com:443#50%off');
    expect(ss).not.toBeNull();
    expect(ss?.name).toBe('50%off');
  });
});
