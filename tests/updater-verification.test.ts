import { describe, it, expect } from 'vitest';
import { AppUpdater } from '../src/main/updater/AppUpdater';
import * as crypto from 'crypto';

describe('AppUpdater & Checksum Verification', () => {
  it('should verify file buffer sha256 checksum correctly', () => {
    const testContent = Buffer.from('RYOX VPN - 100% Free Forever Open Source Release Package');
    const expectedHash = crypto.createHash('sha256').update(testContent).digest('hex');

    const isValid = AppUpdater.verifyFileChecksum(testContent, expectedHash);
    expect(isValid).toBe(true);

    const isTampered = AppUpdater.verifyFileChecksum(testContent, '0000000000000000000000000000000000000000000000000000000000000000');
    expect(isTampered).toBe(false);
  });

  it('should report current stable version as 1.0.0', () => {
    expect(AppUpdater.getCurrentVersion()).toBe('1.0.0');
  });
});
