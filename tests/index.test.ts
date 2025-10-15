import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuAction } from '~/ui/menu';

const state = vi.hoisted(() => ({
  ensureHost: vi.fn(),
  abortSetup: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  settingsStore: { cert: 'stored-cert' as string | undefined },
  settingsPath: '/mock/settings.json',
  debugState: false,
  isDebugMode: vi.fn(),
  setDebugMode: vi.fn(),
  menuStatuses: [] as string[],
  menuDebugStatuses: [] as string[],
  menuRunning: false,
  promptResponses: [] as Array<string | { reject: string }>,
  dpadActive: false,
  helpActive: false,
  menuInstance: null as unknown,
  dpadInstance: null as unknown,
  helpInstance: null as unknown,
  remoteInstance: null as unknown,
  remoteConstructorArgs: null as unknown,
  remoteHandlers: new Map<string, (payload: unknown) => unknown>(),
  processHandlers: new Map<string, (...args: unknown[]) => void>(),
  exitShouldThrow: true,
  exitCalls: [] as number[],
  exitAppRef: undefined as undefined | (() => void),
  helpAppVersion: undefined as string | undefined,
}));

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const resetState = () => {
  state.ensureHost.mockReset();
  state.abortSetup.mockReset();
  state.getSetting.mockReset();
  state.setSetting.mockReset();
  state.isDebugMode.mockReset();
  state.setDebugMode.mockReset();
  state.menuStatuses = [];
  state.menuDebugStatuses = [];
  state.menuRunning = false;
  state.promptResponses = [];
  state.dpadActive = false;
  state.helpActive = false;
  state.menuInstance = null;
  state.dpadInstance = null;
  state.helpInstance = null;
  state.remoteInstance = null;
  state.remoteConstructorArgs = null;
  state.remoteHandlers = new Map();
  state.processHandlers = new Map();
  state.settingsStore = { cert: 'stored-cert' };
  state.settingsPath = '/mock/settings.json';
  state.debugState = false;
  state.exitShouldThrow = true;
  state.exitCalls = [];
  state.exitAppRef = undefined;
  state.helpAppVersion = undefined;
};

type LoadContext = {
  importError: unknown;
  exitSpy: ReturnType<typeof vi.spyOn>;
  logSpy: ReturnType<typeof vi.spyOn>;
  errorSpy: ReturnType<typeof vi.spyOn>;
  processOnSpy: ReturnType<typeof vi.spyOn>;
  restore: () => void;
};

type LoadOptions = {
  settingsPath?: string;
  ensureHost?: () => Promise<string>;
  promptResponses?: Array<string | { reject: string }>;
  initialSettings?: Partial<typeof state.settingsStore>;
  exitShouldThrow?: boolean;
  packageVersion?: unknown;
};

async function loadIndex(cliArgs: string[] = [], options: LoadOptions = {}): Promise<LoadContext> {
  vi.resetModules();
  resetState();

  if (options.settingsPath) {
    state.settingsPath = options.settingsPath;
  }
  if (options.initialSettings) {
    state.settingsStore = { ...state.settingsStore, ...options.initialSettings };
  }
  if (options.promptResponses) {
    state.promptResponses = [...options.promptResponses];
  }
  if (options.exitShouldThrow !== undefined) {
    state.exitShouldThrow = options.exitShouldThrow;
  }
  if (options.ensureHost) {
    state.ensureHost.mockImplementation(options.ensureHost);
  } else {
    state.ensureHost.mockResolvedValue('10.0.0.2');
  }
  state.abortSetup.mockImplementation((error) => {
    throw error instanceof Error ? error : new Error(String(error));
  });
  state.getSetting.mockImplementation(
    (key: string) => state.settingsStore[key as keyof typeof state.settingsStore]
  );
  state.setSetting.mockImplementation((key: string, value: unknown) => {
    state.settingsStore[key as keyof typeof state.settingsStore] = value as never;
  });
  state.isDebugMode.mockImplementation(() => state.debugState);
  state.setDebugMode.mockImplementation((value: boolean) => {
    state.debugState = value;
  });
  if (state.promptResponses.length === 0) {
    state.promptResponses = ['2468'];
  }

  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    state.exitCalls.push(code ?? 0);
    if (state.exitShouldThrow) {
      throw new Error(`exit:${code ?? 0}`);
    }
  }) as unknown as typeof process.exit);
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
    event: string,
    handler: (...args: unknown[]) => void
  ) => {
    state.processHandlers.set(event, handler);
    return process;
  }) as typeof process.on);

  await vi.doMock('~/setup', () => ({
    ensureHost: state.ensureHost,
    abortSetup: state.abortSetup,
  }));

  await vi.doMock('../package.json', () => ({
    default: {
      version: options.packageVersion ?? '1.0.0',
    },
  }));

  await vi.doMock('~/settings', () => ({
    default: { path: state.settingsPath },
    getSetting: state.getSetting,
    setSetting: state.setSetting,
  }));

  await vi.doMock('~/debug', () => ({
    isDebugMode: state.isDebugMode,
    setDebugMode: state.setDebugMode,
  }));

  await vi.doMock('~/ui/menu', () => ({
    default: class MockMenuUI {
      public readonly items;
      public readonly onAction;
      public readonly start;
      public readonly stop;
      public readonly setStatus;
      public readonly setDebugStatus;
      public readonly isRunning;
      public readonly setHeaderLabel;
      public readonly promptPairingCode;

      constructor(options: { items: unknown; onAction: (action: string) => unknown }) {
        state.menuInstance = this;
        this.items = options.items;
        this.onAction = options.onAction;
        this.start = vi.fn(() => {
          state.menuRunning = true;
        });
        this.stop = vi.fn(() => {
          state.menuRunning = false;
        });
        this.setStatus = vi.fn((message: string) => {
          state.menuStatuses.push(message);
        });
        this.setDebugStatus = vi.fn((message: string) => {
          state.menuDebugStatuses.push(message);
        });
        this.isRunning = vi.fn(() => state.menuRunning);
        this.setHeaderLabel = vi.fn();
        this.promptPairingCode = vi.fn(async () => {
          const next = state.promptResponses.shift();
          if (next === undefined) {
            return '0000';
          }
          if (typeof next === 'object' && 'reject' in next) {
            throw new Error(next.reject);
          }
          return String(next).trim();
        });
      }
    },
  }));

  await vi.doMock('~/ui/dpad-mode', () => ({
    default: class MockDpadModeController {
      public readonly start;
      public readonly exit;
      public readonly isActive;
      public readonly setHeaderLabel;

      constructor(options: { exitApp: () => void }) {
        state.dpadInstance = this;
        state.exitAppRef = options.exitApp;
        this.start = vi.fn(() => {
          state.dpadActive = true;
        });
        this.exit = vi.fn(() => {
          state.dpadActive = false;
        });
        this.isActive = vi.fn(() => state.dpadActive);
        this.setHeaderLabel = vi.fn();
      }
    },
  }));

  await vi.doMock('~/ui/help', () => ({
    default: class MockHelpScreenController {
      public readonly start;
      public readonly exit;
      public readonly isActive;

      constructor(options: { exitApp: () => void; appVersion: string }) {
        state.helpInstance = this;
        state.exitAppRef = options.exitApp;
        state.helpAppVersion = options.appVersion;
        this.start = vi.fn(() => {
          state.helpActive = true;
        });
        this.exit = vi.fn(() => {
          state.helpActive = false;
        });
        this.isActive = vi.fn(() => state.helpActive);
      }
    },
  }));

  await vi.doMock('~/lib/androidtv-remote', () => {
    class MockAndroidRemote {
      public readonly handlers = new Map<string, (payload: unknown) => unknown>();
      public readonly start = vi.fn(async () => undefined);
      public readonly stop = vi.fn();
      public readonly getCertificate = vi.fn(() => 'cert-from-remote');
      public readonly sendCode = vi.fn();
      public readonly sendPower = vi.fn();
      public readonly sendKey = vi.fn();

      constructor(host: string, options: unknown) {
        state.remoteInstance = this;
        state.remoteConstructorArgs = { host, options };
      }

      on(event: string, handler: (payload: unknown) => unknown) {
        this.handlers.set(event, handler);
        state.remoteHandlers.set(event, handler);
      }

      emit(event: string, payload?: unknown) {
        return this.handlers.get(event)?.(payload);
      }
    }

    return {
      AndroidRemote: MockAndroidRemote,
      RemoteDirection: { SHORT: 'SHORT' },
      RemoteKeyCode: {},
    };
  });

  process.argv = ['node', 'cli', ...cliArgs];

  let importError: unknown;
  try {
    await import('~/index');
  } catch (error) {
    importError = error;
  }

  const restore = () => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    processOnSpy.mockRestore();
    vi.unmock('~/setup');
    vi.unmock('~/settings');
    vi.unmock('~/debug');
    vi.unmock('~/ui/menu');
    vi.unmock('~/ui/dpad-mode');
    vi.unmock('~/ui/help');
    vi.unmock('~/lib/androidtv-remote');
    vi.unmock('../package.json');
    vi.resetModules();
  };

  return {
    importError,
    exitSpy,
    logSpy,
    errorSpy,
    processOnSpy,
    restore,
  };
}

describe('index entrypoint', () => {
  beforeEach(() => {
    resetState();
  });

  it('prints config path and exits', async () => {
    const ctx = await loadIndex(['config'], { settingsPath: '/tmp/config/settings.json' });
    expect(ctx.importError).toBeInstanceOf(Error);
    expect((ctx.importError as Error).message).toBe('exit:0');
    expect(state.ensureHost).not.toHaveBeenCalled();
    expect(ctx.logSpy).toHaveBeenCalled();
    const output = (ctx.logSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(output).toContain('📁 Config file path: /tmp/config/settings.json');
    ctx.restore();
  });

  it('aborts setup when ensureHost fails', async () => {
    const failure = new Error('host lookup failed');
    const ctx = await loadIndex([], { ensureHost: () => Promise.reject(failure) });
    expect(ctx.importError).toBe(failure);
    expect(state.ensureHost).toHaveBeenCalledTimes(1);
    ctx.restore();
  });

  it('initializes remote and handles menu actions', async () => {
    const ctx = await loadIndex([], { promptResponses: [' 2468 '] });
    expect(ctx.importError).toBeUndefined();
    const remote = state.remoteInstance as { emit: (event: string, payload?: unknown) => unknown };
    expect(remote).toBeTruthy();
    expect(state.remoteConstructorArgs).toEqual({
      host: '10.0.0.2',
      options: {
        pairing_port: 6467,
        remote_port: 6466,
        name: 'androidtv-remote',
        cert: 'stored-cert',
      },
    });

    remote.emit('ready');
    await flush();
    expect(state.setSetting).toHaveBeenCalledWith('cert', 'cert-from-remote');
    expect((state.menuInstance as { start: ReturnType<typeof vi.fn> }).start).toHaveBeenCalled();
    expect(state.menuStatuses).toContain('Connected to device.');

    const onAction = (
      state.menuInstance as { onAction: (action: string) => Promise<unknown> | unknown }
    ).onAction;
    await expect(onAction('mute')).resolves.toBe('Mute command sent.');
    await expect(onAction('power')).resolves.toBe('Power toggle sent.');
    await expect(onAction('home')).resolves.toBe('Home command sent.');
    expect(state.menuDebugStatuses).toContain('Debug: Off');

    await expect(onAction('debug')).resolves.toBe('Debug enabled.');
    expect(state.setDebugMode).toHaveBeenCalledWith(true);
    await expect(onAction('debug')).resolves.toBe('Debug disabled.');
    expect(state.setDebugMode).toHaveBeenLastCalledWith(false);

    await expect(onAction('dpad')).resolves.toBeUndefined();
    expect((state.dpadInstance as { start: ReturnType<typeof vi.fn> }).start).toHaveBeenCalled();

    await expect(onAction('help')).resolves.toBeUndefined();
    expect((state.helpInstance as { start: ReturnType<typeof vi.fn> }).start).toHaveBeenCalled();

    await expect(onAction('unknown' as unknown as MenuAction)).resolves.toBeUndefined();

    remote.emit('volume', { playerModel: 'Living Room TV' });
    expect(
      (state.dpadInstance as { setHeaderLabel: ReturnType<typeof vi.fn> }).setHeaderLabel
    ).toHaveBeenCalledWith('Living Room TV');
    expect(
      (state.menuInstance as { setHeaderLabel: ReturnType<typeof vi.fn> }).setHeaderLabel
    ).toHaveBeenCalledWith('Living Room TV');

    remote.emit('volume', {});
    expect(
      (state.dpadInstance as { setHeaderLabel: ReturnType<typeof vi.fn> }).setHeaderLabel
    ).toHaveBeenCalledTimes(1);

    remote.emit('secret');
    await flush();
    expect(state.menuStatuses).toContain('Pairing required. Enter the code to continue.');
    expect(state.menuStatuses).toContain('Pairing code sent. Waiting for device...');
    expect((state.dpadInstance as { exit: ReturnType<typeof vi.fn> }).exit).toHaveBeenCalledWith(
      false
    );
    expect((state.helpInstance as { exit: ReturnType<typeof vi.fn> }).exit).toHaveBeenCalledWith(
      false
    );
    expect(
      (state.remoteInstance as { sendCode: ReturnType<typeof vi.fn> }).sendCode
    ).toHaveBeenCalledWith('2468');

    remote.emit('error', 'Boom');
    expect(state.menuStatuses).toContain('Error: Boom');

    ctx.restore();
  });

  it('handles pairing cancellation and exit command', async () => {
    const ctx = await loadIndex([], {
      promptResponses: [{ reject: 'cancelled' }],
      exitShouldThrow: false,
    });
    expect(ctx.importError).toBeUndefined();
    const remote = state.remoteInstance as { emit: (event: string, payload?: unknown) => unknown };

    remote.emit('secret');
    await flush();
    expect(ctx.exitSpy).toHaveBeenCalledWith(0);

    expect(state.menuStatuses).toContain('Pairing cancelled.');
    expect((state.remoteInstance as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalled();
    expect((state.menuInstance as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalled();

    const ctx2 = await loadIndex([], { promptResponses: ['1357'], exitShouldThrow: false });
    expect(ctx2.importError).toBeUndefined();
    const menu = state.menuInstance as {
      onAction: (action: string) => Promise<unknown> | unknown;
      setStatus: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    };
    const dpad = state.dpadInstance as { exit: ReturnType<typeof vi.fn> };
    const help = state.helpInstance as { exit: ReturnType<typeof vi.fn> };
    await menu.onAction('exit');
    expect(ctx2.exitSpy).toHaveBeenCalledWith(0);
    expect(menu.setStatus).toHaveBeenCalledWith('Closing remote...');
    expect(menu.stop).toHaveBeenCalled();
    expect(dpad.exit).toHaveBeenCalledWith(false);
    expect(help.exit).toHaveBeenCalledWith(false);
    expect((state.remoteInstance as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalled();
    const stopCallCount = (state.remoteInstance as { stop: ReturnType<typeof vi.fn> }).stop.mock
      .calls.length;
    state.exitAppRef?.();
    expect(
      (state.remoteInstance as { stop: ReturnType<typeof vi.fn> }).stop.mock.calls.length
    ).toBe(stopCallCount);

    const statusCount = state.menuStatuses.length;
    (state.remoteInstance as { emit: (event: string, payload?: unknown) => unknown }).emit(
      'secret'
    );
    await flush();
    expect(state.menuStatuses.length).toBe(statusCount);

    ctx.restore();
    ctx2.restore();
  });

  it('responds to process signals', async () => {
    state.exitShouldThrow = false;
    const ctxSigInt = await loadIndex([], { exitShouldThrow: false });
    const sigintHandler = state.processHandlers.get('SIGINT');
    expect(sigintHandler).toBeTypeOf('function');
    sigintHandler?.();
    await flush();
    expect(ctxSigInt.exitSpy).toHaveBeenCalledWith(0);
    ctxSigInt.restore();

    state.exitShouldThrow = false;
    const ctxSigTerm = await loadIndex([], { exitShouldThrow: false });
    const sigtermHandler = state.processHandlers.get('SIGTERM');
    expect(sigtermHandler).toBeTypeOf('function');
    sigtermHandler?.();
    await flush();
    expect(ctxSigTerm.exitSpy).toHaveBeenCalledWith(0);
    ctxSigTerm.restore();

    state.exitShouldThrow = false;
    const ctxExit = await loadIndex([], { exitShouldThrow: false });
    const exitHandler = state.processHandlers.get('exit');
    expect(exitHandler).toBeTypeOf('function');
    exitHandler?.();
    await flush();
    expect((state.dpadInstance as { exit: ReturnType<typeof vi.fn> }).exit).toHaveBeenCalledWith(
      false
    );
    expect((state.helpInstance as { exit: ReturnType<typeof vi.fn> }).exit).toHaveBeenCalledWith(
      false
    );
    expect((state.menuInstance as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalled();
    expect((state.remoteInstance as { stop: ReturnType<typeof vi.fn> }).stop).toHaveBeenCalled();
    ctxExit.restore();
  });

  it('starts d-pad mode when requested on launch', async () => {
    state.promptResponses = ['1234'];
    const ctx = await loadIndex(['dpad']);
    expect(ctx.importError).toBeUndefined();
    const remote = state.remoteInstance as { emit: (event: string) => unknown };
    remote.emit('ready');
    await flush();
    expect((state.dpadInstance as { start: ReturnType<typeof vi.fn> }).start).toHaveBeenCalled();
    ctx.restore();
  });

  it('starts help screen when requested on launch', async () => {
    const ctx = await loadIndex(['help']);
    expect(ctx.importError).toBeUndefined();
    const remote = state.remoteInstance as { emit: (event: string) => unknown };
    remote.emit('ready');
    await flush();
    expect((state.helpInstance as { start: ReturnType<typeof vi.fn> }).start).toHaveBeenCalled();
    ctx.restore();
  });

  it('falls back to unknown app version when package version is not a string', async () => {
    const ctx = await loadIndex([], { packageVersion: 42, exitShouldThrow: false });
    expect(state.helpAppVersion).toBe('unknown');
    ctx.restore();
  });

  it('treats unavailable activity state as inactive during pairing', async () => {
    const ctx = await loadIndex([], { promptResponses: ['7777'], exitShouldThrow: false });
    const remote = state.remoteInstance as { emit: (event: string, payload?: unknown) => unknown };
    const menu = state.menuInstance as { start: ReturnType<typeof vi.fn> };

    menu.start();
    (state.dpadInstance as { isActive: ReturnType<typeof vi.fn> }).isActive.mockImplementationOnce(
      () => undefined as unknown as boolean
    );
    (state.helpInstance as { isActive: ReturnType<typeof vi.fn> }).isActive.mockImplementationOnce(
      () => undefined as unknown as boolean
    );

    remote.emit('secret');
    await flush();
    expect(menu.start).toHaveBeenCalledTimes(2);
    ctx.restore();
  });

  it('restores pairing context and restarts menu after success', async () => {
    const ctx = await loadIndex([], {
      promptResponses: ['1357'],
      exitShouldThrow: false,
    });
    expect(ctx.importError).toBeUndefined();
    const remote = state.remoteInstance as { emit: (event: string, payload?: unknown) => unknown };

    (state.helpInstance as { start: ReturnType<typeof vi.fn> }).start();
    remote.emit('secret');
    await flush();
    expect((state.helpInstance as { exit: ReturnType<typeof vi.fn> }).exit).toHaveBeenCalledWith(
      false
    );

    remote.emit('ready');
    await flush();
    expect((state.helpInstance as { start: ReturnType<typeof vi.fn> }).start).toHaveBeenCalledTimes(
      2
    );
    ctx.restore();

    const ctx2 = await loadIndex([], {
      promptResponses: ['2468'],
      exitShouldThrow: false,
    });
    const remote2 = state.remoteInstance as { emit: (event: string, payload?: unknown) => unknown };
    const menu = state.menuInstance as { start: ReturnType<typeof vi.fn> };

    menu.start();
    remote2.emit('secret');
    await flush();
    expect(
      (state.remoteInstance as { sendCode: ReturnType<typeof vi.fn> }).sendCode
    ).toHaveBeenCalledWith('2468');
    expect(menu.start).toHaveBeenCalledTimes(2);

    ctx2.restore();

    const ctx3 = await loadIndex([], {
      promptResponses: ['8888'],
      exitShouldThrow: false,
    });
    const remote3 = state.remoteInstance as { emit: (event: string, payload?: unknown) => unknown };
    const menu3 = state.menuInstance as { start: ReturnType<typeof vi.fn> };

    remote3.emit('secret');
    await flush();
    expect(menu3.start).not.toHaveBeenCalled();

    ctx3.restore();
  });
});
