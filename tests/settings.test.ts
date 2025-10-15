import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('conf', () => {
  const store = new Map<string, unknown>();

  class MockConf {
    constructor(options?: unknown) {
      void options;
    }

    set(key: string, value: unknown) {
      store.set(key, value);
    }

    get(key: string, defaultValue?: unknown) {
      if (store.has(key)) {
        return store.get(key);
      }
      return defaultValue;
    }
  }

  return {
    default: MockConf,
    __store: store,
    __reset: () => store.clear(),
  };
});

const loadSettingsModule = async () => import('~/settings');

beforeEach(async () => {
  const mockConf = await import('conf');
  (mockConf as unknown as { __reset: () => void }).__reset();

  // Reset module cache so each test gets a fresh Conf instance.
  await vi.resetModules();
});

describe('settings helpers', () => {
  it('returns undefined for missing keys', async () => {
    const { getSetting } = await loadSettingsModule();

    expect(getSetting('missing')).toBeUndefined();
  });

  it('uses provided default value when key is missing', async () => {
    const { getSetting } = await loadSettingsModule();

    expect(getSetting('missing', 'fallback')).toBe('fallback');
  });

  it('persists values via setSetting and default export', async () => {
    const settingsModule = await loadSettingsModule();
    settingsModule.setSetting('token', 'abc123');

    expect(settingsModule.getSetting('token')).toBe('abc123');
    expect(settingsModule.default.get('token')).toBe('abc123');
  });
});
