export type ColorSchemePreference = 'system' | 'light' | 'dark';

export interface StoredApiKey {
  key: string;
  persistent: boolean;
}

const API_KEY_STORAGE_KEY = 'subq-api-key';
const COLOR_SCHEME_STORAGE_KEY = 'subq-color-scheme';

function safeStorageGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Ignore storage quota or private-mode security errors
  }
}

function safeStorageRemove(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Ignore storage security errors
  }
}

/** A key saved with "keep in this browser" expires after this time and must be entered again. */
export const PERSISTENT_KEY_TTL_DAYS = 7;
const PERSISTENT_KEY_TTL_MS = PERSISTENT_KEY_TTL_DAYS * 24 * 60 * 60 * 1000;

interface PersistedApiKeyRecord {
  v: 1;
  key: string;
  expiresAt: number;
}

function serializePersistentKey(key: string, now: number): string {
  const record: PersistedApiKeyRecord = { v: 1, key, expiresAt: now + PERSISTENT_KEY_TTL_MS };
  return JSON.stringify(record);
}

/**
 * Reads the localStorage value. Returns the key, or '' when the value is missing,
 * expired or malformed. Values saved by older versions are plain strings without an
 * expiry: they stay valid and are rewritten with an expiry, so users keep their key.
 */
function readPersistentKey(storage: Storage | undefined, now: number): string {
  const raw = safeStorageGet(storage, API_KEY_STORAGE_KEY)?.trim() ?? '';
  if (!raw) return '';

  if (!raw.startsWith('{')) {
    safeStorageSet(storage, API_KEY_STORAGE_KEY, serializePersistentKey(raw, now));
    return raw;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedApiKeyRecord> | null;
    const key = typeof parsed?.key === 'string' ? parsed.key.trim() : '';
    const expiresAt = typeof parsed?.expiresAt === 'number' ? parsed.expiresAt : 0;
    if (parsed?.v === 1 && key && Number.isFinite(expiresAt) && expiresAt > now) {
      return key;
    }
  } catch {
    // Malformed value: remove it below.
  }
  safeStorageRemove(storage, API_KEY_STORAGE_KEY);
  return '';
}

export function getStoredApiKey(now: number = Date.now()): StoredApiKey {
  if (typeof window === 'undefined') {
    return { key: '', persistent: false };
  }

  const sessionVal = safeStorageGet(window.sessionStorage, API_KEY_STORAGE_KEY)?.trim() ?? '';
  if (sessionVal) {
    return { key: sessionVal, persistent: false };
  }

  const localVal = readPersistentKey(window.localStorage, now);
  if (localVal) {
    return { key: localVal, persistent: true };
  }

  return { key: '', persistent: false };
}

export function saveApiKey(key: string, persistent: boolean, now: number = Date.now()): void {
  if (typeof window === 'undefined') return;

  const trimmed = key.trim();
  if (!trimmed) {
    clearApiKey();
    return;
  }

  if (persistent) {
    safeStorageSet(window.localStorage, API_KEY_STORAGE_KEY, serializePersistentKey(trimmed, now));
    safeStorageRemove(window.sessionStorage, API_KEY_STORAGE_KEY);
  } else {
    safeStorageSet(window.sessionStorage, API_KEY_STORAGE_KEY, trimmed);
    safeStorageRemove(window.localStorage, API_KEY_STORAGE_KEY);
  }
}

export function clearApiKey(): void {
  if (typeof window === 'undefined') return;
  safeStorageRemove(window.localStorage, API_KEY_STORAGE_KEY);
  safeStorageRemove(window.sessionStorage, API_KEY_STORAGE_KEY);
}

export function getColorSchemeOverride(): ColorSchemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = safeStorageGet(window.localStorage, COLOR_SCHEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return 'system';
}

export function applyColorScheme(scheme: ColorSchemePreference): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (scheme === 'light' || scheme === 'dark') {
    safeStorageSet(window.localStorage, COLOR_SCHEME_STORAGE_KEY, scheme);
  } else {
    safeStorageRemove(window.localStorage, COLOR_SCHEME_STORAGE_KEY);
  }

  const metaContent = scheme === 'system' ? 'light dark' : scheme;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    document.head?.appendChild(meta);
  }
  meta.content = metaContent;
}

export function subscribeStorageChanges(onUpdate: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === API_KEY_STORAGE_KEY ||
      event.key === COLOR_SCHEME_STORAGE_KEY
    ) {
      if (event.key === null || event.key === COLOR_SCHEME_STORAGE_KEY) {
        const nextScheme = getColorSchemeOverride();
        const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
        if (meta) {
          meta.content = nextScheme === 'system' ? 'light dark' : nextScheme;
        }
      }
      onUpdate();
    }
  };

  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('storage', handler);
  };
}
