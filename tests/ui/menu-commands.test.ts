import { describe, expect, it, vi } from 'vitest';
import type { AndroidRemote } from '~/lib/androidtv-remote';
import type MenuUI from '~/ui/menu';
import {
  backCommand,
  dpadDownCommand,
  dpadLeftCommand,
  dpadRightCommand,
  dpadUpCommand,
  enterCommand,
  exitCommand,
  homeCommand,
  muteCommand,
  numberCommand,
  powerCommand,
  selectCommand,
  volumeDownCommand,
  volumeUpCommand,
} from '~/ui/menu-commands';

vi.mock('~/lib/androidtv-remote', () => ({
  RemoteDirection: { SHORT: 'SHORT' },
  RemoteKeyCode: {
    KEYCODE_HOME: 'HOME',
    KEYCODE_VOLUME_MUTE: 'MUTE',
    KEYCODE_BACK: 'BACK',
    KEYCODE_VOLUME_UP: 'VOL_UP',
    KEYCODE_VOLUME_DOWN: 'VOL_DOWN',
    KEYCODE_DPAD_UP: 'UP',
    KEYCODE_DPAD_DOWN: 'DOWN',
    KEYCODE_DPAD_LEFT: 'LEFT',
    KEYCODE_DPAD_RIGHT: 'RIGHT',
    KEYCODE_ENTER: 'ENTER',
    KEYCODE_DPAD_CENTER: 'CENTER',
    KEYCODE_0: '0',
    KEYCODE_1: '1',
    KEYCODE_2: '2',
    KEYCODE_3: '3',
    KEYCODE_4: '4',
    KEYCODE_5: '5',
    KEYCODE_6: '6',
    KEYCODE_7: '7',
    KEYCODE_8: '8',
    KEYCODE_9: '9',
  },
}));

const createRemote = () =>
  ({
    sendKey: vi.fn(),
    sendPower: vi.fn(),
  }) as unknown as AndroidRemote;

describe('menu-commands helpers', () => {
  it('sends directional and action key commands', () => {
    const remote = createRemote();

    expect(homeCommand(remote)).toBe('Home command sent.');
    expect(muteCommand(remote)).toBe('Mute command sent.');
    expect(backCommand(remote)).toBe('Back command sent.');
    expect(volumeUpCommand(remote)).toBe('Volume up command sent.');
    expect(volumeDownCommand(remote)).toBe('Volume down command sent.');
    expect(dpadUpCommand(remote)).toBe('D-pad Up command sent.');
    expect(dpadDownCommand(remote)).toBe('D-pad Down command sent.');
    expect(dpadLeftCommand(remote)).toBe('D-pad Left command sent.');
    expect(dpadRightCommand(remote)).toBe('D-pad Right command sent.');
    expect(enterCommand(remote)).toBe('Enter command sent.');
    expect(selectCommand(remote)).toBe('Select command sent.');

    expect(remote.sendKey).toHaveBeenCalledTimes(11);
    expect(remote.sendKey).toHaveBeenNthCalledWith(1, 'HOME', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(2, 'MUTE', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(3, 'BACK', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(4, 'VOL_UP', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(5, 'VOL_DOWN', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(6, 'UP', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(7, 'DOWN', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(8, 'LEFT', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(9, 'RIGHT', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(10, 'ENTER', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(11, 'CENTER', 'SHORT');
  });

  it('sends numeric commands', () => {
    const remote = createRemote();

    expect(numberCommand(remote, '3')).toBe('Number 3 command sent.');
    expect(numberCommand(remote, '0')).toBe('Number 0 command sent.');

    expect(remote.sendKey).toHaveBeenNthCalledWith(1, '3', 'SHORT');
    expect(remote.sendKey).toHaveBeenNthCalledWith(2, '0', 'SHORT');
  });

  it('triggers power command', () => {
    const remote = createRemote();

    expect(powerCommand(remote)).toBe('Power toggle sent.');
    expect(remote.sendPower).toHaveBeenCalledTimes(1);
    expect(remote.sendKey).not.toHaveBeenCalled();
  });

  it('updates menu status on exit', () => {
    const menu = {
      setStatus: vi.fn(),
    } as unknown as MenuUI;
    const exitExecutor = vi.fn();

    exitCommand(menu, exitExecutor);

    expect(menu.setStatus).toHaveBeenCalledWith('Closing remote...');
    expect(exitExecutor).toHaveBeenCalledTimes(1);
  });
});
