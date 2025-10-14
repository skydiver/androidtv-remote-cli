import { describe, it, expect, vi } from 'vitest';
import MenuUI, { type MenuAction, type MenuItem } from '../src/ui/menu';

type KeyLike = {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
};

const menuItems: MenuItem[] = [
  { label: '🎮  D-pad Controls', action: 'dpad', shortcut: 'd' },
  { label: '🏠  Home', action: 'home', shortcut: 'h' },
  { label: '🔇  Mute', action: 'mute', shortcut: 'm' },
  { label: '🔌  Power', action: 'power', shortcut: 'p' },
  { label: '🐞  Debug', action: 'debug', shortcut: 'g' },
  { label: 'ℹ️  Help', action: 'help', shortcut: 'i' },
  { label: '🚪  Exit', action: 'exit', shortcut: 'e' },
];

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

const createMenu = () => {
  const actionSpy = vi.fn((action: MenuAction) => `Action: ${action}`);
  const menu = new MenuUI({
    items: menuItems,
    onAction: actionSpy,
  });

  const press = async (key: KeyLike) => {
    const handler = (menu as unknown as {
      handleKeypressBound: (input: string, key: KeyLike) => void;
    }).handleKeypressBound;

    handler('', key);
    await flushMicrotasks();
  };

  return { menu, actionSpy, press };
};

describe('MenuUI keyboard interactions', () => {
  it('triggers the current selection on Enter', async () => {
    const { press, actionSpy } = createMenu();

    await press({ name: 'return' });

    expect(actionSpy).toHaveBeenCalledTimes(1);
    expect(actionSpy).toHaveBeenCalledWith('dpad');
  });

  it('moves selection downward and activates the new item', async () => {
    const { press, actionSpy } = createMenu();

    await press({ name: 'down' });
    await press({ name: 'return' });

    expect(actionSpy).toHaveBeenCalledWith('home');
  });

  it('wraps selection when moving past the final item', async () => {
    const { press, actionSpy, menu } = createMenu();

    menu.setSelectionIndex(menuItems.length - 1);
    await press({ name: 'down' });
    await press({ name: 'return' });

    expect(actionSpy).toHaveBeenCalledWith('dpad');
  });

  it('invokes shortcut keys and updates status message', async () => {
    const { press, actionSpy, menu } = createMenu();

    await press({ name: 'm' });

    expect(actionSpy).toHaveBeenCalledWith('mute');
    expect(menu.getStatus()).toBe('Action: mute');
  });

  it('handles escape key by triggering exit', async () => {
    const { press, actionSpy } = createMenu();

    await press({ name: 'escape' });

    expect(actionSpy).toHaveBeenCalledWith('exit');
  });
});
