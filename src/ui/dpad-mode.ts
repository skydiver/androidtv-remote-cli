import readline from 'readline';
import { AndroidRemote } from '../lib/androidtv-remote';
import MenuUI from './menu';
import {
  dpadDownCommand,
  dpadLeftCommand,
  dpadRightCommand,
  dpadUpCommand,
  enterCommand,
  selectCommand,
} from './menu-commands';

export interface DpadModeOptions {
  remote: AndroidRemote;
  menu: MenuUI;
  exitApp: () => void;
  formatStatus: (message: string) => string;
}

class DpadModeController {
  private active = false;
  private keypressHandler?: (chunk: string, key: readline.Key) => void;

  constructor(private readonly options: DpadModeOptions) {}

  start(): void {
    if (this.active) {
      return;
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      this.options.menu.setStatus(this.options.formatStatus('D-pad mode requires a TTY environment.'));
      if (!this.options.menu.isRunning()) {
        this.options.menu.start();
      }
      return;
    }

    this.active = true;
    this.options.menu.stop();

    readline.emitKeypressEvents(process.stdin);
    process.stdin.resume();
    process.stdin.setRawMode?.(true);

    console.clear();
    const remoteArt = [
      '        ┌────────┐',
      '        │ POWER  │',
      '┌───────┴────────┴───────┐',
      '│           ^            │',
      '│       <   ○   >        │',
      '│           v            │',
      '├──────────┬─────────────┤',
      '│ SPACE -> │ ENTER key   │',
      '│ ENTER    │ -> SELECT   │',
      '├──────────┴─────────────┤',
      '│ ESC returns to menu    │',
      '│ Ctrl+C exits app       │',
      '└────────────────────────┘',
    ];
    remoteArt.forEach((line) => console.log(line));

    this.keypressHandler = (_chunk, key) => {
      if (!key) {
        return;
      }

      if (key.ctrl && key.name === 'c') {
        this.options.exitApp();
        return;
      }

      if (key.name === 'escape') {
        this.exit();
        return;
      }

      switch (key.name) {
        case 'up':
          console.log('↑ D-pad Up');
          dpadUpCommand(this.options.remote);
          break;
        case 'down':
          console.log('↓ D-pad Down');
          dpadDownCommand(this.options.remote);
          break;
        case 'left':
          console.log('← D-pad Left');
          dpadLeftCommand(this.options.remote);
          break;
        case 'right':
          console.log('→ D-pad Right');
          dpadRightCommand(this.options.remote);
          break;
        case 'space':
          console.log('␠ Enter command');
          enterCommand(this.options.remote);
          break;
        case 'return':
        case 'enter':
          console.log('⏎ Select command');
          selectCommand(this.options.remote);
          break;
        default:
          if (key.sequence === ' ') {
            console.log('␠ Enter command');
            enterCommand(this.options.remote);
          }
          break;
      }
    };

    process.stdin.on('keypress', this.keypressHandler);
  }

  exit(shouldRestartMenu = true): void {
    if (!this.active) {
      return;
    }

    if (this.keypressHandler) {
      process.stdin.off('keypress', this.keypressHandler);
      this.keypressHandler = undefined;
    }

    process.stdin.setRawMode?.(false);
    process.stdin.pause();

    this.active = false;

    if (shouldRestartMenu) {
      console.clear();
      console.log('Returning to menu...');
      this.options.menu.setStatus(this.options.formatStatus('Exited D-pad mode.'));
      this.options.menu.start();
    }
  }

  isActive(): boolean {
    return this.active;
  }
}

export default DpadModeController;
