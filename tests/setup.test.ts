import { beforeEach, describe, expect, it, vi } from 'vitest';

const promptMock = vi.fn();

vi.mock('enquirer', () => ({
  default: {
    prompt: promptMock,
  },
  prompt: promptMock,
}));

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
    __reset: () => store.clear(),
  };
});

const importSetup = () => import('~/setup');
const importSettings = () => import('~/settings');

beforeEach(async () => {
  promptMock.mockReset();
  await vi.resetModules();
  const confModule = await import('conf');
  (confModule as unknown as { __reset: () => void }).__reset();
});

describe('ensureHost', () => {
  it('returns a trimmed stored host without prompting', async () => {
    const settings = await importSettings();
    settings.setSetting('host', ' 192.168.1.2  ');

    const { ensureHost } = await importSetup();
    const host = await ensureHost();

    expect(host).toBe('192.168.1.2');
    expect(promptMock).not.toHaveBeenCalled();
  });

  it('prompts when host is missing and validates input', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    promptMock.mockImplementation(async (questions: unknown) => {
      const question = Array.isArray(questions) ? questions[0] : questions;

      if (question && typeof question === 'object' && 'validate' in question) {
        const validate = (question as { validate: (value: string) => unknown }).validate;
        expect(validate('invalid')).toBe('Please enter a valid IPv4 address.');
        expect(validate('192.168.0.10')).toBe(true);
      }

      return { host: ' 10.0.0.5 ' };
    });

    const { ensureHost } = await importSetup();
    const host = await ensureHost();

    expect(host).toBe('10.0.0.5');
    const settings = await importSettings();
    expect(settings.getSetting('host')).toBe('10.0.0.5');

    expect(promptMock).toHaveBeenCalledTimes(1);
    logSpy.mockRestore();
  });
});

describe('abortSetup', () => {
  it('logs an error and exits with code 1', async () => {
    const { abortSetup } = await importSetup();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 'unknown'}`);
    }) as unknown as typeof process.exit);

    expect(() => abortSetup(new Error('Boom'))).toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Android TV Remote setup aborted: Boom')
    );

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('falls back to default message for non-error reasons', async () => {
    const { abortSetup } = await importSetup();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 'unknown'}`);
    }) as unknown as typeof process.exit);

    expect(() => abortSetup('nope')).toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith(
      'Android TV Remote setup aborted: Setup cancelled by user.'
    );

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
