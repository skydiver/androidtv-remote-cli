import readline from 'readline';
import { isDebugMode } from '../debug';
import { AndroidRemote } from '../lib/androidtv-remote';
import MenuUI from './menu';
import {
  type DigitKey,
  backCommand,
  dpadDownCommand,
  dpadLeftCommand,
  dpadRightCommand,
  dpadUpCommand,
  homeCommand,
  muteCommand,
  numberCommand,
  selectCommand,
  volumeDownCommand,
  volumeUpCommand,
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
  private headerLabel?: string;

  constructor(private readonly options: DpadModeOptions) {
    this.headerLabel = 'Android TV';
  }

  start(): void {
    if (this.active) {
      return;
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      this.options.menu.setStatus(
        this.options.formatStatus('D-pad mode requires a TTY environment.')
      );
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

    this.renderRemote();

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

      if (key.name === 'backspace') {
        if (isDebugMode()) {
          console.log('🔙 Back');
        }
        backCommand(this.options.remote);
        return;
      }

      if (key.name === 'm') {
        if (isDebugMode()) {
          console.log('🔇 Mute');
        }
        muteCommand(this.options.remote);
        return;
      }

      if (key.name === 'h') {
        if (isDebugMode()) {
          console.log('🏠 Home');
        }
        homeCommand(this.options.remote);
        return;
      }

      if (key.sequence === '+') {
        if (isDebugMode()) {
          console.log('🔊 Volume Up');
        }
        volumeUpCommand(this.options.remote);
        return;
      }

      if (key.sequence === '-') {
        if (isDebugMode()) {
          console.log('🔉 Volume Down');
        }
        volumeDownCommand(this.options.remote);
        return;
      }

      const digit = this.extractDigitKey(key);
      if (digit) {
        if (isDebugMode()) {
          console.log(`🔢 Number ${digit}`);
        }
        numberCommand(this.options.remote, digit);
        return;
      }

      switch (key.name) {
        case 'up':
          if (isDebugMode()) {
            console.log('↑ D-pad Up');
          }
          dpadUpCommand(this.options.remote);
          break;
        case 'down':
          if (isDebugMode()) {
            console.log('↓ D-pad Down');
          }
          dpadDownCommand(this.options.remote);
          break;
        case 'left':
          if (isDebugMode()) {
            console.log('← D-pad Left');
          }
          dpadLeftCommand(this.options.remote);
          break;
        case 'right':
          if (isDebugMode()) {
            console.log('→ D-pad Right');
          }
          dpadRightCommand(this.options.remote);
          break;
        case 'space':
        case 'enter':
        case 'return':
          if (isDebugMode()) {
            console.log('⌨ Select command');
          }
          selectCommand(this.options.remote);
          break;
        default:
          if (key.sequence === ' ') {
            if (isDebugMode()) {
              console.log('⌨ Select command');
            }
            selectCommand(this.options.remote);
          }
          break;
      }
    };

    process.stdin.on('keypress', this.keypressHandler);
  }

  private extractDigitKey(key: readline.Key): DigitKey | undefined {
    const candidate = key.name ?? key.sequence;
    if (!candidate) {
      return undefined;
    }

    if (candidate.length === 1 && candidate >= '0' && candidate <= '9') {
      return candidate as DigitKey;
    }

    return undefined;
  }

  setHeaderLabel(label: string | undefined): void {
    this.headerLabel = label;
    if (this.active) {
      this.renderRemote();
    }
  }

  private renderRemote(): void {
    console.clear();
    const [headerTop, headerMiddle] = this.buildHeaderLines();
    const remoteArt = [
      headerTop,
      headerMiddle,
      '├──────────────────────────┤',
      '│           ^              │',
      '│       <   ○   >          │',
      '│           v              │',
      '├──────────┬───────────────┤',
      '│ ⌨ Select │ Enter key     │',
      '│ 🔙 Back  │ Backspace key │',
      '├──────────┼───────────────┤',
      '│ 🔊 Vol ↑ │ + key         │',
      '│ 🔉 Vol ↓ │ - key         │',
      '│ 🔇 Mute  │ m key         │',
      '│ 🏠 Home  │ h key         │',
      '│ 🔢 0-9   │ number keys   │',
      '├──────────┴───────────────┤',
      '│ ESC returns to menu      │',
      '│ Ctrl+C exits app         │',
      '└──────────────────────────┘',
    ];
    remoteArt.forEach((line) => console.log(line));
  }

  private buildHeaderLines(): [string, string] {
    const interiorWidth = 26;
    const content = this.buildHeaderContent(interiorWidth);
    const top = `┌${'─'.repeat(interiorWidth)}┐`;
    const middle = `│${content}│`;
    return [top, middle];
  }

  private buildHeaderContent(width: number): string {
    const trimmedLabel = this.headerLabel?.trim();
    const fallback = 'Android TV';
    const text = trimmedLabel && trimmedLabel.length > 0 ? trimmedLabel : fallback;
    const clipped = text.length > width ? text.slice(0, width) : text;
    const spaceCount = width - clipped.length;
    const leftPadding = Math.floor(spaceCount / 2);
    const rightPadding = spaceCount - leftPadding;
    return `${' '.repeat(leftPadding)}${clipped}${' '.repeat(rightPadding)}`;
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
