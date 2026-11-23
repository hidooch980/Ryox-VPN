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
});
