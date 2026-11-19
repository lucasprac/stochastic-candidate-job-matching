import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERSISTENT_KEY_TTL_DAYS,
  clearApiKey,
  getStoredApiKey,
  saveApiKey,
} from './apiKey';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
let local: MemoryStorage;
let session: MemoryStorage;

beforeEach(() => {
  local = new MemoryStorage();
  session = new MemoryStorage();
  vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('API key storage', () => {
  it('stores a session key only in sessionStorage', () => {
    saveApiKey('sk-session', false);
    expect(session.getItem('subq-api-key')).toBe('sk-session');
    expect(local.getItem('subq-api-key')).toBeNull();
    expect(getStoredApiKey()).toEqual({ key: 'sk-session', persistent: false });
  });

  it('stores a persistent key with an expiry and drops it after the TTL', () => {
    const now = 1_700_000_000_000;
    saveApiKey('sk-persist', true, now);
    expect(session.getItem('subq-api-key')).toBeNull();
    expect(local.getItem('subq-api-key')).not.toBe('sk-persist');

    expect(getStoredApiKey(now + DAY_MS)).toEqual({ key: 'sk-persist', persistent: true });

    const afterTtl = now + PERSISTENT_KEY_TTL_DAYS * DAY_MS + 1;
    expect(getStoredApiKey(afterTtl)).toEqual({ key: '', persistent: false });
    expect(local.getItem('subq-api-key')).toBeNull();
  });

  it('keeps a legacy plain-string key and migrates it to the expiring format', () => {
    const now = 1_700_000_000_000;
    local.setItem('subq-api-key', 'sk-legacy');
    expect(getStoredApiKey(now)).toEqual({ key: 'sk-legacy', persistent: true });
    const migrated = JSON.parse(local.getItem('subq-api-key')!) as { key: string; expiresAt: number };
    expect(migrated.key).toBe('sk-legacy');
    expect(migrated.expiresAt).toBe(now + PERSISTENT_KEY_TTL_DAYS * DAY_MS);
  });

  it('removes malformed values and clears both storages', () => {
    local.setItem('subq-api-key', '{not json');
    expect(getStoredApiKey()).toEqual({ key: '', persistent: false });
    expect(local.getItem('subq-api-key')).toBeNull();

    saveApiKey('sk-a', true);
    session.setItem('subq-api-key', 'sk-b');
    clearApiKey();
    expect(local.getItem('subq-api-key')).toBeNull();
    expect(session.getItem('subq-api-key')).toBeNull();
  });
});
