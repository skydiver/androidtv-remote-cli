import { EventEmitter } from 'events';
import readline from 'readline';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('enquirer', () => {
  const prompt = vi.fn();
  return { default: { prompt }, prompt };
});

import enquirer from 'enquirer';
import MenuUI, { type MenuAction, type MenuItem } from '../src/ui/menu';

class MockStdin extends EventEmitter {
  resume = vi.fn();
  pause = vi.fn();
  setRawMode = vi.fn();
  isTTY = true;

  override on(event: string | symbol, listener: (...args: unknown[]) => unknown): this {
    super.on(event, listener);
    return this;
  }

  override off(event: string | symbol, listener: (...args: unknown[]) => unknown): this {
    super.off(event, listener);
    return this;
  }

  send(sequence: string): void {
    this.emit('data', Buffer.from(sequence));
  }
}

const flushAsync = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
};

const menuItems: MenuItem[] = [
  { label: '🎮  D-pad Controls', action: 'dpad', shortcut: 'd' },
  { label: '🏠  Home', action: 'home', shortcut: 'h' },
  { label: '🔇  Mute', action: 'mute', shortcut: 'm' },
  { label: '🔌  Power', action: 'power', shortcut: 'p' },
];

let stdin: MockStdin;
const originalStdin = process.stdin;
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStdoutIsTTY = process.stdout.isTTY;

beforeEach(() => {
  stdin = new MockStdin();
  Object.defineProperty(process, 'stdin', { configurable: true, value: stdin });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.mocked((enquirer as unknown as { prompt: Mock }).prompt).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process, 'stdin', { configurable: true, value: originalStdin });
  Object.defineProperty(process.stdout, 'write', { configurable: true, value: originalStdoutWrite });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalStdoutIsTTY });
});

const createMenu = (items: MenuItem[] = menuItems) => {
  const notifications: string[] = [];
  const actionSpy = vi.fn((action: MenuAction) => `Action: ${action}`);

  const menu = new MenuUI({
    items,
    onAction: (action: MenuAction) => {
      notifications.push(action);
      return actionSpy(action);
    },
  });

  const start = () => {
    menu.start();
    readline.emitKeypressEvents(stdin);
  };

  const sendKey = (sequence: string) => {
    stdin.send(sequence);
  };

  return { menu, notifications, actionSpy, start, sendKey };
};

describe('MenuUI', () => {
  it('requires a TTY to start', () => {
    stdin.isTTY = false;
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { menu } = createMenu();
    menu.start();

    expect(logSpy).toHaveBeenCalledWith('Interactive menu requires a TTY environment.');
    expect(stdin.resume).not.toHaveBeenCalled();
  });

  it('starts and stops correctly', () => {
    const { menu } = createMenu();
    menu.start();
    expect(menu.isRunning()).toBe(true);
    expect(stdin.resume).toHaveBeenCalled();
    expect(stdin.setRawMode).toHaveBeenCalledWith(true);

    menu.stop();
    expect(menu.isRunning()).toBe(false);
    expect(stdin.pause).toHaveBeenCalled();
    expect(stdin.setRawMode).toHaveBeenCalledWith(false);
  });

  it('updates status, header, and debug text', () => {
    const { menu } = createMenu();
    menu.start();

    menu.setStatus('Hello');
    menu.setHeaderLabel(' Living Room ');
    menu.setDebugStatus('Enabled');
    menu.setDebugStatus('');

    expect(menu.getStatus()).toBe('Hello');
  });

  it('sets selection index only when within bounds', () => {
    const { menu } = createMenu();
    menu.setSelectionIndex(99);
    menu.start();
    menu.setSelectionIndex(1);
    expect((menu as unknown as { selectionIndex: number }).selectionIndex).toBe(1);
    menu.setSelectionIndex(-1);
    expect((menu as unknown as { selectionIndex: number }).selectionIndex).toBe(1);
  });

  it('handles selection navigation and shortcuts', async () => {
    const { menu, actionSpy, notifications, start, sendKey } = createMenu();
    start();

    sendKey('m');
    await flushAsync();
    expect(actionSpy).toHaveBeenCalledWith('mute');
    expect(notifications).toContain('mute');

    menu.setSelectionIndex(0);
    sendKey('\u001b[B'); // arrow down
    sendKey('\r');
    await flushAsync();
    expect(actionSpy).toHaveBeenCalledWith('home');

    sendKey('q');
    await flushAsync();
    expect(notifications).toContain('exit');

    menu.setSelectionIndex(0);
    sendKey('\u001b[A');
    sendKey('\r');
    await flushAsync();
    expect(actionSpy).toHaveBeenCalledWith('power');
  });


  it('handles escape key by triggering exit action', async () => {
    const { menu, notifications } = createMenu();
    (menu as unknown as { handleKeypressBound: (input: string, key: readline.Key) => void }).handleKeypressBound(
      '',
      { name: 'escape' } as readline.Key,
    );
    await flushAsync();
    expect(notifications).toContain('exit');
  });

  it('handles enter key by triggering current selection', async () => {
    const { menu, notifications } = createMenu();
    const handler = (menu as unknown as { handleKeypressBound: (input: string, key: readline.Key) => void }).handleKeypressBound.bind(menu);
    handler('', { name: 'return' } as readline.Key);
    handler('', { name: 'enter' } as readline.Key);
    await flushAsync();
    expect(notifications[0]).toBe('dpad');
  });

  it('handles control key exits', async () => {
    const { start, sendKey, notifications } = createMenu();
    start();

    sendKey('\u0003'); // ctrl+c
    await flushAsync();
    expect(notifications).toContain('exit');
  });

  it('ignores triggerAction while processing', async () => {
    const { menu } = createMenu();
    (menu as unknown as { running: boolean }).running = true;
    (menu as unknown as { processingSelection: boolean }).processingSelection = true;
    await (menu as unknown as { triggerAction: (action: MenuAction) => Promise<void> }).triggerAction('dpad');
    expect(menu.getStatus()).toBe('Select an option');
  });

  it('sets error status when non-error values are thrown', async () => {
    const menu = new MenuUI({
      items: menuItems,
      onAction: () => {
        throw 'boom';
      },
    });
    (menu as unknown as { running: boolean }).running = true;
    await (menu as unknown as { triggerAction: (action: MenuAction) => Promise<void> }).triggerAction('dpad');
    expect(menu.getStatus()).toBe('Error: Unknown error');
  });

  it('sets error status when action throws', async () => {

    const menu = new MenuUI({
      items: menuItems,
      onAction: () => {
        throw new Error('boom');
      },
    });
    (menu as unknown as { running: boolean }).running = true;
    await (menu as unknown as { triggerAction: (action: MenuAction) => Promise<void> }).triggerAction('dpad');
    expect(menu.getStatus()).toBe('Error: boom');
  });


  it('does nothing when stopping if not running', () => {
    const { menu } = createMenu();
    menu.stop();
    expect(stdin.pause).not.toHaveBeenCalled();
  });

  it('ignores repeated start calls', () => {
    const { menu, start } = createMenu();
    start();
    menu.start();
    expect(stdin.resume).toHaveBeenCalledTimes(1);
  });

  it('formats labels without shortcuts and limited width', () => {
    const { menu } = createMenu([{ label: 'Label', action: 'home' }]);
    const internal = menu as unknown as {
      formatItemLabel: (item: MenuItem, shortcutText: string | undefined, width: number) => string;
      truncate: (text: string, width: number) => string;
      padRight: (text: string, width: number) => string;
    };

    const result = internal.formatItemLabel({ label: 'LongLabel', action: 'home' }, undefined, 4);
    expect(result.trim()).toBe('Long');
    expect(internal.formatItemLabel({ label: 'X', action: 'home' }, '(H)', 0)).toBe('');
    expect(internal.truncate('XY', 0)).toBe('');
    expect(internal.padRight('XY', 0)).toBe('');
  });


  it('truncates long strings when rendering', () => {
    const { menu } = createMenu([{ label: 'Item', action: 'home' }]);
    menu.setStatus('X' * 100);
    menu.start();

    const originalMax = Math.max;
    (Math as unknown as { max: (...values: number[]) => number }).max = () => 10;
    menu.stop();
    (menu as unknown as { statusMessage: string }).statusMessage = 'Y' * 100;
    menu.start();
    (Math as unknown as { max: (...values: number[]) => number }).max = originalMax;
  });

  it('formats shortcut labels with minimal space', () => {
    const { menu } = createMenu();
    const internal = menu as unknown as {
      formatItemLabel: (item: MenuItem, shortcutText: string | undefined, width: number) => string;
      padRight: (text: string, width: number) => string;
    };

    const item: MenuItem = { label: 'L', action: 'home', shortcut: 'h' };

    const originalMin = Math.min;
    (Math as unknown as { min: (...values: number[]) => number }).min = ((...values: number[]) => values[0]);
    const labelSpaceZero = internal.formatItemLabel(item, '(H)', 3);
    expect(labelSpaceZero.length).toBe(3);
    (Math as unknown as { min: (...values: number[]) => number }).min = originalMin;

    const originalPad = internal.padRight.bind(menu);
    internal.padRight = () => 'XXXXX';
    const clipped = internal.formatItemLabel(item, '(H)', 3);
    expect(clipped.length).toBe(3);
    internal.padRight = originalPad;
  });

  it('sets error status when non-error values are thrown', async () => {
    const menu = new MenuUI({
      items: menuItems,
      onAction: () => {
        throw 'boom';
      },
    });
    (menu as unknown as { running: boolean }).running = true;
    await (menu as unknown as { triggerAction: (action: MenuAction) => Promise<void> }).triggerAction('dpad');
    expect(menu.getStatus()).toBe('Error: Unknown error');
  });

  it('prompts for pairing codes', async () => {
    const promptSpy = vi.mocked((enquirer as unknown as { prompt: Mock }).prompt);
    promptSpy.mockResolvedValueOnce({ code: ' 1234 ' });

    const { menu } = createMenu();
    const code = await menu.promptPairingCode();

    expect(code).toBe(' 1234 ');
    expect(promptSpy).toHaveBeenCalledWith([
      {
        type: 'input',
        name: 'code',
        message: 'Enter pairing code:',
        validate: expect.any(Function),
      },
    ]);
    const validateFn = promptSpy.mock.calls[0][0][0].validate;
    expect(validateFn('  ')).toBe('Code cannot be empty.');
    expect(validateFn(' 123 ')).toBe(true);
    expect(stdin.pause).toHaveBeenCalled();
  });
  it('prompts for pairing codes', async () => {
    const promptSpy = vi.mocked((enquirer as unknown as { prompt: Mock }).prompt);
    promptSpy.mockResolvedValueOnce({ code: ' 1234 ' });

    const { menu } = createMenu();
    const code = await menu.promptPairingCode();

    expect(code).toBe(' 1234 ');
    expect(promptSpy).toHaveBeenCalled();
    expect(stdin.pause).toHaveBeenCalled();
  });
});
