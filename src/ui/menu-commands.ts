import { AndroidRemote, RemoteDirection, RemoteKeyCode } from '../lib/androidtv-remote';
import MenuUI from './menu';

export type ExitExecutor = () => void;

export function muteCommand(remote: AndroidRemote): string {
  remote.sendKey(RemoteKeyCode.KEYCODE_VOLUME_MUTE, RemoteDirection.SHORT);
  return 'Mute command sent.';
}

export function powerCommand(remote: AndroidRemote): string {
  remote.sendPower();
  return 'Power toggle sent.';
}

export function exitCommand(menu: MenuUI, exitExecutor: ExitExecutor): void {
  menu.setStatus('Closing remote...');
  exitExecutor();
}
