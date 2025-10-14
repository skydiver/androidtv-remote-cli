import readline from 'readline';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const commandMocks = vi.hoisted(() => ({
  backCommand: vi.fn(),
  dpadDownCommand: vi.fn(),
  dpadLeftCommand: vi.fn(),
  dpadRightCommand: vi.fn(),
  dpadUpCommand: vi.fn(),
  homeCommand: vi.fn(),
  muteCommand: vi.fn(),
  numberCommand: vi.fn(),
  selectCommand: vi.fn(),
  volumeDownCommand: vi.fn(),
  volumeUpCommand: vi.fn(),
}));

vi.mock('../src/ui/menu-commands', () => commandMocks);

vi.mock('../src/lib/androidtv-remote', () => ({
  AndroidRemote: vi.fn(),
}));

import DpadModeController from '../src/ui/dpad-mode';
import { setDebugMode } from '../src/debug';

type KeyHandler = (chunk: string, key: readline.Key) => void;

const originalStdin = process.stdin;
const originalStdout = process.stdout;

let stdinStub: {
  isTTY: boolean;
  setRawMode: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

let stdoutStub: { isTTY: boolean };
let keypressHandler: KeyHandler | undefined;
let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleClearSpy: ReturnType<typeof vi.spyOn>;

const emitKeypress = (key?: Partial<readline.Key>) => {
  if (!keypressHandler) {
    throw new Error('keypress handler not registered');
  }

  keypressHandler('', key as unknown as readline.Key);
};

const createController = () => {
  const menu = {
    stop: vi.fn(),
    start: vi.fn(),
    setStatus: vi.fn(),
    isRunning: vi.fn(() => false),
  };

  const exitApp = vi.fn();
  const formatStatus = vi.fn((message: string) => message);
  const remote = { id: 'remote' };

  const controller = new DpadModeController({
    remote: remote as unknown as any,
    menu: menu as unknown as any,
    exitApp,
    formatStatus,
  });

  return { controller, menu, exitApp, formatStatus, remote };
};

beforeEach(() => {
  keypressHandler = undefined;

  stdinStub = {
    isTTY: true,
    setRawMode: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    on: vi.fn((event: string, handler: KeyHandler) => {
      if (event === 'keypress') {
        keypressHandler = handler;
      }
    }),
    off: vi.fn((event: string, handler: KeyHandler) => {
      if (event === 'keypress' && keypressHandler === handler) {
        keypressHandler = undefined;
      }
    }),
  };

  stdoutStub = { isTTY: true };

  Object.defineProperty(process, 'stdin', { configurable: true, value: stdinStub });
  Object.defineProperty(process, 'stdout', { configurable: true, value: stdoutStub });

  setDebugMode(false);
  Object.values(commandMocks).forEach((mock) => mock.mockReset());

  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  consoleClearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
});

afterEach(() => {
  Object.defineProperty(process, 'stdin', { configurable: true, value: originalStdin });
  Object.defineProperty(process, 'stdout', { configurable: true, value: originalStdout });
  setDebugMode(false);
  vi.restoreAllMocks();
});

describe('DpadModeController', () => {
  it('falls back to menu when TTY is unavailable', () => {
    const { controller, menu, formatStatus } = createController();
    const statusMessage = 'fallback';
    formatStatus.mockReturnValue(statusMessage);

    stdinStub.isTTY = false;

    controller.start();

    expect(menu.setStatus).toHaveBeenCalledWith(statusMessage);
    expect(menu.start).toHaveBeenCalled();
    expect(stdinStub.resume).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('initializes key listeners and processes controls', () => {
    const { controller, menu, exitApp, remote } = createController();
    const emitSpy = vi.spyOn(readline, 'emitKeypressEvents').mockImplementation(() => {});

    controller.start();
    const rawHandler = stdinStub.on.mock.calls.find(
      (call) => call[0] === 'keypress'
    )?.[1] as KeyHandler | undefined;
    rawHandler?.('', undefined as unknown as readline.Key);
    expect(controller.isActive()).toBe(true);

    expect(menu.stop).toHaveBeenCalled();
    expect(stdinStub.resume).toHaveBeenCalled();
    expect(stdinStub.setRawMode).toHaveBeenCalledWith(true);
    expect(emitSpy).toHaveBeenCalledWith(stdinStub);

    emitKeypress({ name: 'm' });
    emitKeypress({ name: 'h' });
    emitKeypress({ sequence: '+' });
    emitKeypress({ sequence: '-' });
    emitKeypress({ name: 'backspace' });
    emitKeypress({ name: '3' });
    emitKeypress({});
    emitKeypress({ name: 'up' });
    emitKeypress({ name: 'down' });
    emitKeypress({ name: 'left' });
    controller.setHeaderLabel('  Philips Ambilight TV  ');
    expect(consoleClearSpy).toHaveBeenCalled();
    controller.setHeaderLabel('   ');
    controller.setHeaderLabel(undefined);
    controller.setHeaderLabel('A very long model name that exceeds width');
    expect(consoleLogSpy).toHaveBeenCalled();

    emitKeypress({ name: 'right' });
    emitKeypress({ name: 'return' });
    emitKeypress({ sequence: ' ' });

    expect(commandMocks.muteCommand).toHaveBeenCalledWith(remote);
    expect(commandMocks.homeCommand).toHaveBeenCalledWith(remote);
    expect(commandMocks.volumeUpCommand).toHaveBeenCalledWith(remote);
    expect(commandMocks.volumeDownCommand).toHaveBeenCalledWith(remote);
    expect(commandMocks.backCommand).toHaveBeenCalledWith(remote);
    expect(commandMocks.numberCommand).toHaveBeenCalledWith(remote, '3');
    expect(commandMocks.dpadUpCommand).toHaveBeenCalledWith(remote);
    expect(commandMocks.dpadDownCommand).toHaveBeenCalledWith(remote);
    expect(commandMocks.dpadLeftCommand).toHaveBeenCalledWith(remote);
    expect(commandMocks.dpadRightCommand).toHaveBeenCalledWith(remote);
    expect(commandMocks.selectCommand).toHaveBeenCalledTimes(2);
    expect(commandMocks.selectCommand).toHaveBeenNthCalledWith(1, remote);
    expect(commandMocks.selectCommand).toHaveBeenNthCalledWith(2, remote);

    emitKeypress({ name: 'c', ctrl: true });
    expect(exitApp).toHaveBeenCalled();

    emitKeypress({ name: 'escape' });
    expect(stdinStub.off).toHaveBeenCalled();
    expect(menu.start).toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);

    controller.exit(false);
    expect(stdinStub.pause).toHaveBeenCalled();

    controller.setHeaderLabel('Idle state');
  });

  it('logs command descriptions when debug mode is enabled', () => {
    const { controller } = createController();
    vi.spyOn(readline, 'emitKeypressEvents').mockImplementation(() => {});

    setDebugMode(true);
    controller.start();
    emitKeypress({ name: 'm' });
    emitKeypress({ name: 'return' });
    emitKeypress({ name: 'space' });
    emitKeypress({ sequence: ' ' });
    emitKeypress({ name: 'right' });
    emitKeypress({ name: 'up' });
    emitKeypress({ name: 'down' });
    emitKeypress({ name: 'left' });
    emitKeypress({ name: 'backspace' });
    emitKeypress({ sequence: '+' });
    emitKeypress({ sequence: '-' });
    emitKeypress({ name: 'h' });
    emitKeypress({ name: '3' });

    expect(consoleLogSpy).toHaveBeenCalledWith('🔇 Mute');
    expect(consoleLogSpy).toHaveBeenCalledWith('⌨ Select command');
    expect(consoleLogSpy).toHaveBeenCalledWith('→ D-pad Right');
    expect(consoleLogSpy).toHaveBeenCalledWith('↑ D-pad Up');
    expect(consoleLogSpy).toHaveBeenCalledWith('↓ D-pad Down');
    expect(consoleLogSpy).toHaveBeenCalledWith('← D-pad Left');
    expect(consoleLogSpy).toHaveBeenCalledWith('🔊 Volume Up');
    expect(consoleLogSpy).toHaveBeenCalledWith('🔉 Volume Down');
    expect(consoleLogSpy).toHaveBeenCalledWith('🔙 Back');
    expect(consoleLogSpy).toHaveBeenCalledWith('🏠 Home');
    expect(consoleLogSpy).toHaveBeenCalledWith('🔢 Number 3');
  });

  it('ignores repeated start calls when already active', () => {
    const { controller } = createController();
    vi.spyOn(readline, 'emitKeypressEvents').mockImplementation(() => {});

    controller.start();
    controller.start();

    expect(stdinStub.on).toHaveBeenCalledTimes(1);
  });
});
