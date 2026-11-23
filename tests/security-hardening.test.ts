import { describe, it, expect } from 'vitest';
import { KillSwitch } from '../src/main/vpn/KillSwitch';
import { KillSwitchService } from '../src/main/security/KillSwitchService';
import { TrafficMeter, queryProcessCounters } from '../src/main/vpn/TrafficMeter';

describe('KillSwitch safety guards', () => {
  it('refuses to arm when the VPN core binary is missing', async () => {
    // Blocking all outbound traffic without a running core would disconnect the
    // machine, so arm() must fail closed instead of installing a block rule.
    const armed = await KillSwitch.arm('Z:\\definitely\\not\\a\\core.exe');

    expect(armed).toBe(false);
    expect(KillSwitch.isArmed()).toBe(false);
  });

  it('refuses to arm when no core path is supplied at all', async () => {
    expect(await KillSwitch.arm()).toBe(false);
    expect(KillSwitch.isArmed()).toBe(false);
  });

  it('exposes one shared state through the KillSwitchService façade', async () => {
    const service = new KillSwitchService();
    expect(service.isEnabled()).toBe(false);

    // The façade must not report success when the underlying arm was refused.
    await expect(service.enable()).resolves.toBe(false);
    expect(service.isEnabled()).toBe(false);
  });
});

describe('TrafficMeter', () => {
  it('reports zero throughput when no core process is running', async () => {
    const samples: Array<{ downloadBps: number; uploadBps: number }> = [];
    const meter = new TrafficMeter(() => undefined, (s) => samples.push(s), 10);

    meter.start();
    await new Promise((resolve) => setTimeout(resolve, 40));
    meter.stop();

    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((s) => s.downloadBps === 0 && s.uploadBps === 0)).toBe(true);
  });

  it('resolves a zero sample for invalid pids instead of throwing', async () => {
    await expect(queryProcessCounters(0)).resolves.toEqual({ downloadBps: 0, uploadBps: 0 });
    await expect(queryProcessCounters(-5)).resolves.toEqual({ downloadBps: 0, uploadBps: 0 });
  });
});
