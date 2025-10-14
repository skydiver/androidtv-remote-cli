import readline from 'readline';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type MenuUI from '../src/ui/menu';
import HelpScreenController from '../src/ui/help';

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

  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: stdinStub,
  });
  Object.defineProperty(process, 'stdout', {
    configurable: true,
    value: stdoutStub,
  });

  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  consoleClearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {});
});

afterEach(() => {
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: originalStdin,
  });
  Object.defineProperty(process, 'stdout', {
    configurable: true,
    value: originalStdout,
  });

  vi.restoreAllMocks();
});

const createController = () => {
  const statusMessages: string[] = [];
  const formatStatus = vi.fn((message: string) => {
    statusMessages.push(message);
    return message;
  });

  const menuStub = {
    stop: vi.fn(),
    start: vi.fn(),
    setStatus: vi.fn(),
    isRunning: vi.fn(() => false),
  };

  const exitApp = vi.fn();

  const controller = new HelpScreenController({
    menu: menuStub as unknown as MenuUI,
    exitApp,
    formatStatus,
    appVersion: '1.2.3',
  });

  return { controller, menu: menuStub, exitApp, formatStatus, statusMessages };
};

describe('HelpScreenController', () => {
  it('starts only once when already active', () => {
    const { controller, menu } = createController();
    const emitSpy = vi.spyOn(readline, 'emitKeypressEvents').mockImplementation(() => {});

    controller.start();
    controller.start();

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(menu.stop).toHaveBeenCalledTimes(1);
  });

  it('requires a TTY and restarts the menu when idle', () => {
    const { controller, menu, statusMessages } = createController();
    stdinStub.isTTY = false;

    controller.start();

    expect(statusMessages).toContain('Help screen requires a TTY environment.');
    expect(menu.setStatus).toHaveBeenCalledTimes(1);
    expect(menu.start).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(false);
    expect(consoleClearSpy).not.toHaveBeenCalled();
  });

  it('does not restart menu if it is already running', () => {
    const { controller, menu, statusMessages } = createController();
    stdoutStub.isTTY = false;
    menu.isRunning.mockReturnValue(true);

    controller.start();

    expect(statusMessages).toContain('Help screen requires a TTY environment.');
    expect(menu.start).not.toHaveBeenCalled();
  });

  it('renders help content and handles keypresses', () => {
    const { controller, menu, exitApp, statusMessages } = createController();
    const emitSpy = vi.spyOn(readline, 'emitKeypressEvents').mockImplementation(() => {});

    controller.start();
    expect(controller.isActive()).toBe(true);
    expect(statusMessages).toContain(
      'Viewing help screen. Press Esc or Enter to return to menu.'
    );

    expect(menu.stop).toHaveBeenCalledTimes(1);
    expect(menu.setStatus).toHaveBeenCalledWith(
      'Viewing help screen. Press Esc or Enter to return to menu.'
    );
    expect(emitSpy).toHaveBeenCalledWith(stdinStub);
    expect(stdinStub.setRawMode).toHaveBeenCalledWith(true);
    expect(consoleClearSpy).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Android TV Remote CLI Help')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '\nPress Esc or Enter to return to the menu. Ctrl+C exits the app.'
    );

    emitKeypress();
    emitKeypress({ ctrl: true, name: 'c' });
    expect(exitApp).toHaveBeenCalledTimes(1);

    const logCountBeforeExit = consoleLogSpy.mock.calls.length;
    controller.exit(false);
    expect(controller.isActive()).toBe(false);
    expect(consoleLogSpy.mock.calls.length).toBe(logCountBeforeExit);
    expect(stdinStub.setRawMode).toHaveBeenCalledWith(false);
    expect(stdinStub.pause).toHaveBeenCalledTimes(1);
    expect(stdinStub.off).toHaveBeenCalledTimes(1);
    expect(keypressHandler).toBeUndefined();

    let expectedMenuStarts = 0;
    const exitWithKey = (key: Partial<readline.Key>) => {
      controller.start();
      expect(controller.isActive()).toBe(true);
      const before = consoleLogSpy.mock.calls.length;
      emitKeypress(key);
      expectedMenuStarts += 1;
      expect(menu.start).toHaveBeenCalledTimes(expectedMenuStarts);
      expect(controller.isActive()).toBe(false);
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(before);
      expect(statusMessages).toContain('Exited help screen.');
      expect(stdinStub.off).toHaveBeenCalledTimes(1 + expectedMenuStarts);
      expect(stdinStub.pause).toHaveBeenCalledTimes(1 + expectedMenuStarts);
      expect(keypressHandler).toBeUndefined();
    };

    exitWithKey({ name: 'return' });
    exitWithKey({ name: 'enter' });
    exitWithKey({ name: 'space' });

    expect(consoleLogSpy).toHaveBeenCalledWith('Returning to menu...');
    expect(stdinStub.setRawMode).toHaveBeenLastCalledWith(false);
    expect(emitSpy).toHaveBeenCalledTimes(1 + expectedMenuStarts);

    const viewingCount = statusMessages.filter((msg) =>
      msg.startsWith('Viewing help screen')
    ).length;
    const exitedCount = statusMessages.filter((msg) => msg === 'Exited help screen.').length;

    expect(viewingCount).toBe(1 + expectedMenuStarts);
    expect(exitedCount).toBe(expectedMenuStarts);
  });

  it('exit is a no-op when inactive', () => {
    const { controller } = createController();

    controller.exit();

    expect(stdinStub.setRawMode).not.toHaveBeenCalled();
    expect(stdinStub.pause).not.toHaveBeenCalled();
  });
});
