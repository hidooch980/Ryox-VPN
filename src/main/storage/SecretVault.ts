import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Encrypts the credential material this app keeps on disk.
 *
 * Server entries carry UUIDs, passwords, Reality keys and WireGuard keys, and
 * subscriptions carry live tokens — all of it used to sit in plaintext JSON
 * under the user's profile. Credentials are now sealed in an envelope:
 *
 *   { "v": 2, "enc": "safeStorage" | "local-key", "payload": "<base64>" }
 *
 * safeStorage is the primary cipher: it is backed by the OS keychain (DPAPI on
 * Windows), so the blobs only decrypt under the same user account. Headless
 * environments (CI, a locked keyring, Linux without a secret service) report
 * encryption as unavailable; there the fallback is AES-256-GCM with a random
 * key stored next to the data with mode 0600. The fallback is weaker than a
 * keychain, but it is still strictly better than plaintext, and it never
 * silently degrades to plaintext.
 *
 * Anything without v: 2 is legacy plaintext: it is read as-is and re-sealed on
 * the next write, so existing installs migrate without losing data.
 */
const ENVELOPE_VERSION = 2;
const KEY_FILE_NAME = 'storage.key';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

type CipherKind = 'safeStorage' | 'local-key';

interface Envelope {
  v: number;
  enc: CipherKind;
  payload: string;
}

/** Minimal shape of the Electron API we depend on, so this module stays testable. */
interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class SecretVault {
  private readonly keyFile: string;
  private cachedKey?: Buffer;
  private available?: boolean;

  constructor(private readonly baseDir: string) {
    this.keyFile = path.join(baseDir, KEY_FILE_NAME);
  }

  /** True when this vault can produce a sealed payload at all. */
  public get usable(): boolean {
    return this.getSafeStorage() !== null || this.getLocalKey() !== null;
  }

  /**
   * Seals data into an envelope object. Returns the input untouched when no
   * cipher is usable, so a caller can still persist something rather than
   * failing the whole save.
   */
  public seal<T>(data: T): T | Envelope {
    const json = JSON.stringify(data);

    const safe = this.getSafeStorage();
    if (safe) {
      try {
        return {
          v: ENVELOPE_VERSION,
          enc: 'safeStorage',
          payload: safe.encryptString(json).toString('base64')
        };
      } catch (err) {
        console.warn('[SecretVault] safeStorage encryption failed, falling back to the local key:', err);
      }
    }

    const key = this.getLocalKey();
    if (!key) {
      // Neither the keychain nor a local key file is usable. Persisting is still
      // better than losing the save, but the caller must not believe the file is
      // protected: this is the one path that writes credentials in the clear.
      console.error('[SecretVault] No usable cipher — writing this value unencrypted.');
      return data;
    }

    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(json, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      v: ENVELOPE_VERSION,
      enc: 'local-key',
      payload: Buffer.concat([iv, tag, ciphertext]).toString('base64')
    };
  }

  /**
   * Opens a value read from disk. Legacy plaintext is returned unchanged; a
   * payload that cannot be decrypted yields undefined so the caller can fall
   * back instead of crashing the app on startup.
   */
  public open<T>(raw: unknown): T | undefined {
    if (!this.isEnvelope(raw)) return raw as T;

    try {
      const bytes = Buffer.from(raw.payload, 'base64');

      if (raw.enc === 'safeStorage') {
        const safe = this.getSafeStorage();
        if (!safe) {
          console.error('[SecretVault] The store was sealed with safeStorage, which is unavailable now.');
          return undefined;
        }
        return JSON.parse(safe.decryptString(bytes)) as T;
      }

      const key = this.getLocalKey();
      if (!key) return undefined;

      const iv = bytes.subarray(0, IV_BYTES);
      const tag = bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
      const ciphertext = bytes.subarray(IV_BYTES + TAG_BYTES);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8');
      return JSON.parse(plain) as T;
    } catch (err) {
      console.error('[SecretVault] Failed to decrypt the stored data:', err);
      return undefined;
    }
  }

  /** True when `raw` is a vault envelope (as opposed to a legacy plaintext value). */
  public isSealed(raw: unknown): raw is Envelope {
    return this.isEnvelope(raw);
  }

  private isEnvelope(raw: unknown): raw is Envelope {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const candidate = raw as Partial<Envelope>;
    return (
      candidate.v === ENVELOPE_VERSION &&
      (candidate.enc === 'safeStorage' || candidate.enc === 'local-key') &&
      typeof candidate.payload === 'string'
    );
  }

  /**
   * The Electron keychain, when it is actually usable. Resolved lazily because
   * this module is also loaded by the unit tests, which run outside Electron.
   */
  private getSafeStorage(): SafeStorageLike | null {
    if (this.available !== undefined) {
      return this.available ? this.loadSafeStorage() : null;
    }

    const safe = this.loadSafeStorage();
    let usable = false;
    if (safe) {
      try {
        usable = safe.isEncryptionAvailable();
      } catch {
        usable = false;
      }
    }

    this.available = usable;
    return usable ? safe : null;
  }

  private loadSafeStorage(): SafeStorageLike | null {
    try {
      // Required lazily: the tests import this module outside an Electron runtime.
      const electron = require('electron') as { safeStorage?: SafeStorageLike };
      return electron && electron.safeStorage ? electron.safeStorage : null;
    } catch {
      return null;
    }
  }

  /** AES key for the no-keychain fallback, created once and kept out of the JSON stores. */
  private getLocalKey(): Buffer | null {
    if (this.cachedKey) return this.cachedKey;

    try {
      if (fs.existsSync(this.keyFile)) {
        const existing = fs.readFileSync(this.keyFile);
        if (existing.length === KEY_BYTES) {
          this.cachedKey = existing;
          return existing;
        }
        console.warn('[SecretVault] The stored key has an unexpected size; replacing it.');
      }

      const key = crypto.randomBytes(KEY_BYTES);
      fs.writeFileSync(this.keyFile, key, { mode: 0o600 });
      this.cachedKey = key;
      return key;
    } catch (err) {
      console.error('[SecretVault] Could not read or create the local key:', err);
      return null;
    }
  }
}
