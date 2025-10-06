import readline from 'readline';
import MenuUI from './menu';

export interface HelpScreenOptions {
  menu: MenuUI;
  exitApp: () => void;
  formatStatus: (message: string) => string;
  appVersion: string;
}

class HelpScreenController {
  private active = false;
  private keypressHandler?: (chunk: string, key: readline.Key) => void;

  constructor(private readonly options: HelpScreenOptions) {}

  start(): void {
    if (this.active) {
      return;
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      this.options.menu.setStatus(this.options.formatStatus('Help screen requires a TTY environment.'));
      if (!this.options.menu.isRunning()) {
        this.options.menu.start();
      }
      return;
    }

    this.active = true;
    this.options.menu.stop();
    this.options.menu.setStatus(
      this.options.formatStatus('Viewing help screen. Press Esc or Enter to return to menu.')
    );

    readline.emitKeypressEvents(process.stdin);
    process.stdin.resume();
    process.stdin.setRawMode?.(true);

    this.render();

    this.keypressHandler = (_chunk, key) => {
      if (!key) {
        return;
      }

      if (key.ctrl && key.name === 'c') {
        this.options.exitApp();
        return;
      }

      if (key.name === 'escape' || key.name === 'return' || key.name === 'enter' || key.name === 'space') {
        this.exit();
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
      this.options.menu.setStatus(this.options.formatStatus('Exited help screen.'));
      this.options.menu.start();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  private render(): void {
    console.clear();
    const lines = this.getHelpLines();
    const contentWidth = Math.max(...lines.map((line) => line.length));
    const horizontal = '─'.repeat(contentWidth + 2);

    const buildLine = (text: string) => {
      const padded = text.padEnd(contentWidth, ' ');
      return `│ ${padded} │`;
    };

    const frame = [
      `┌${horizontal}┐`,
      ...lines.map((line) => buildLine(line)),
      `└${horizontal}┘`,
    ];

    frame.forEach((line) => console.log(line));
    console.log('\nPress Esc or Enter to return to the menu. Ctrl+C exits the app.');
  }

  private getHelpLines(): string[] {
    return [
      'Android TV Remote CLI Help',
      `Software Version: ${this.options.appVersion}`,
      '',
      'Usage:',
      '  tvrc                   Start interactive menu',
      '  tvrc dpad              Jump directly to D-pad controls',
      '  tvrc help              Show this help screen first',
      '',
      'Main Menu Options:',
      '  🎮  D-pad Controls  Enter keyboard-based remote mode',
      '  🏠  Home            Send the Home command',
      '  🔇  Mute            Toggle mute',
      '  🔌  Power           Toggle power on the TV',
      '  ℹ️  Help            View this help screen',
      '  🐞  Debug           Toggle debug logging',
      '  🚪  Exit            Close the application',
      '',
      'D-pad Controls:',
      '  Arrow keys          Move focus',
      '  Enter / Space       Select / OK',
      '  Backspace           Back',
      '  h                   Home',
      '  m                   Mute',
      '  + / -               Volume up / down',
      '  0-9                 Number buttons',
      '  Esc                 Return to menu',
      '  Ctrl+C              Exit application',
    ];
  }
}

export default HelpScreenController;
