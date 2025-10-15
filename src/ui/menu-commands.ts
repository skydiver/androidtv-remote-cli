import { AndroidRemote, RemoteDirection, RemoteKeyCode } from '../lib/androidtv-remote';
import MenuUI from './menu';

export type ExitExecutor = () => void;

const sendKeyCommand = (remote: AndroidRemote, key: RemoteKeyCode, label: string): string => {
  remote.sendKey(key, RemoteDirection.SHORT);
  return `${label} command sent.`;
};

export function homeCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_HOME, 'Home');
}

export function muteCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_VOLUME_MUTE, 'Mute');
}

export function powerCommand(remote: AndroidRemote): string {
  remote.sendPower();
  return 'Power toggle sent.';
}

export function backCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_BACK, 'Back');
}

export function volumeUpCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_VOLUME_UP, 'Volume up');
}

export function volumeDownCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_VOLUME_DOWN, 'Volume down');
}

export function exitCommand(menu: MenuUI, exitExecutor: ExitExecutor): void {
  menu.setStatus('Closing remote...');
  exitExecutor();
}

export function dpadUpCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_DPAD_UP, 'D-pad Up');
}

export function dpadDownCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_DPAD_DOWN, 'D-pad Down');
}

export function dpadLeftCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_DPAD_LEFT, 'D-pad Left');
}

export function dpadRightCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_DPAD_RIGHT, 'D-pad Right');
}

export function enterCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_ENTER, 'Enter');
}

export function selectCommand(remote: AndroidRemote): string {
  return sendKeyCommand(remote, RemoteKeyCode.KEYCODE_DPAD_CENTER, 'Select');
}

const digitToKeyCode: Record<string, RemoteKeyCode> = {
  '0': RemoteKeyCode.KEYCODE_0,
  '1': RemoteKeyCode.KEYCODE_1,
  '2': RemoteKeyCode.KEYCODE_2,
  '3': RemoteKeyCode.KEYCODE_3,
  '4': RemoteKeyCode.KEYCODE_4,
  '5': RemoteKeyCode.KEYCODE_5,
  '6': RemoteKeyCode.KEYCODE_6,
  '7': RemoteKeyCode.KEYCODE_7,
  '8': RemoteKeyCode.KEYCODE_8,
  '9': RemoteKeyCode.KEYCODE_9,
};

export type DigitKey = keyof typeof digitToKeyCode;

export function numberCommand(remote: AndroidRemote, digit: DigitKey): string {
  return sendKeyCommand(remote, digitToKeyCode[digit], `Number ${digit}`);
}
