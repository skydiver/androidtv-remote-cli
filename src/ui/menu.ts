import readline from 'readline';
import enquirer from 'enquirer';

export type MenuAction = 'mute' | 'power' | 'home' | 'debug' | 'dpad' | 'help' | 'exit';

export type MenuItem = {
  label: string;
  action: MenuAction;
  shortcut?: string;
};

export type MenuActionHandler = (action: MenuAction) => Promise<string | void> | string | void;

export interface MenuOptions {
  items: MenuItem[];
  onAction: MenuActionHandler;
}

export class MenuUI {
  private readonly items: MenuItem[];
  private readonly onAction: MenuActionHandler;

  private selectionIndex = 0;
  private statusMessage = 'Select an option';
  private running = false;
  private processingSelection = false;
  private keypressConfigured = false;
  private headerLabel?: string;
  private debugStatus = 'Debug: Off';
  private readonly handleKeypressBound: (_: string, key: readline.Key) => void;

  constructor(options: MenuOptions) {
    this.items = options.items;
    this.onAction = options.onAction;
    this.handleKeypressBound = this.handleKeypress.bind(this);
  }

  start(): void {
    if (this.running) {
      return;
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.log('Interactive menu requires a TTY environment.');
      return;
    }

    if (!this.keypressConfigured) {
      readline.emitKeypressEvents(process.stdin);
      this.keypressConfigured = true;
    }

    process.stdin.resume();
    process.stdin.setRawMode?.(true);

    process.stdin.on('keypress', this.handleKeypressBound);

    this.running = true;
    this.render();
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    process.stdin.off('keypress', this.handleKeypressBound);
    process.stdin.setRawMode?.(false);
    process.stdin.pause();

    this.running = false;
    this.processingSelection = false;
    this.clearScreen();
  }

  isRunning(): boolean {
    return this.running;
  }

  setStatus(message: string): void {
    this.statusMessage = message;
    if (this.running && !this.processingSelection) {
      this.render();
    }
  }

  getStatus(): string {
    return this.statusMessage;
  }

  setHeaderLabel(label: string | undefined): void {
    this.headerLabel = label?.trim();
    if (this.running && !this.processingSelection) {
      this.render();
    }
  }

  setDebugStatus(label: string): void {
    const trimmed = label.trim();
    this.debugStatus = trimmed.length > 0 ? trimmed : 'Debug status unavailable';
    if (this.running && !this.processingSelection) {
      this.render();
    }
  }

  setSelectionIndex(index: number): void {
    if (index >= 0 && index < this.items.length) {
      this.selectionIndex = index;
      if (this.running) {
        this.render();
      }
    }
  }

  promptPairingCode(): Promise<string> {
    process.stdin.resume();
    process.stdin.setRawMode?.(false);

    return enquirer
      .prompt<{ code: string }>([
        {
          type: 'input',
          name: 'code',
          message: 'Enter pairing code:',
          validate: (value: string) => value.trim().length > 0 || 'Code cannot be empty.',
        },
      ])
      .then((result) => result.code)
      .finally(() => {
        process.stdin.pause();
      });
  }

  private async triggerAction(action: MenuAction): Promise<void> {
    if (this.processingSelection) {
      return;
    }

    this.processingSelection = true;

    try {
      const result = await this.onAction(action);

      if (typeof result === 'string' && result.length > 0) {
        this.statusMessage = result;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.statusMessage = `Error: ${message}`;
    } finally {
      this.processingSelection = false;

      if (this.running) {
        this.render();
      }
    }
  }

  private handleKeypress(_: string, key: readline.Key): void {
    if (key.ctrl && key.name === 'c') {
      void this.triggerAction('exit');
      return;
    }

    if (key.name === 'escape') {
      void this.triggerAction('exit');
      return;
    }

    if (key.name && key.name.toLowerCase() === 'q') {
      void this.triggerAction('exit');
      return;
    }

    if (key.name === 'up') {
      this.selectionIndex = (this.selectionIndex + this.items.length - 1) % this.items.length;
      if (this.running) {
        this.render();
      }
      return;
    }

    if (key.name === 'down') {
      this.selectionIndex = (this.selectionIndex + 1) % this.items.length;
      if (this.running) {
        this.render();
      }
      return;
    }

    if (key.name && key.name.length === 1 && !key.ctrl && !key.meta) {
      const shortcutIndex = this.items.findIndex(
        (item) => item.shortcut?.toLowerCase() === key.name?.toLowerCase()
      );

      if (shortcutIndex !== -1) {
        this.selectionIndex = shortcutIndex;
        if (this.running && !this.processingSelection) {
          this.render();
        }
        const currentItem = this.items[shortcutIndex];
        void this.triggerAction(currentItem.action);
        return;
      }
    }

    if (key.name === 'return' || key.name === 'enter') {
      const currentItem = this.items[this.selectionIndex];
      void this.triggerAction(currentItem.action);
    }
  }

  private render(): void {
    const headerText = this.headerLabel && this.headerLabel.length > 0 ? this.headerLabel : 'Android TV Remote';
    const menuTitle = headerText;
    const instructions = '↑/↓ Move  Enter Select  Ctrl+C Exit';
    const debugLine = this.debugStatus;

    const optionLines = this.items.map((item, idx) => {
      const prefix = idx === this.selectionIndex ? '›' : ' ';
      const label = this.formatItemLabel(item);
      return `${prefix} ${label}`;
    });

    const contentWidth = Math.max(
      menuTitle.length,
      instructions.length,
      this.statusMessage.length,
      debugLine.length,
      ...optionLines.map((line) => line.length)
    );

    const horizontal = '─'.repeat(contentWidth + 2);

    const buildLine = (text: string, highlight = false) => {
      const truncated = text.length > contentWidth ? text.slice(0, contentWidth) : text;
      const padded = truncated.padEnd(contentWidth, ' ');
      const display = highlight ? `\x1b[7m${padded}\x1b[0m` : padded;
      return `│ ${display} │`;
    };

    const lines: string[] = [
      `┌${horizontal}┐`,
      buildLine(menuTitle),
      `├${horizontal}┤`,
      ...optionLines.map((line, idx) => buildLine(line, idx === this.selectionIndex)),
      `├${horizontal}┤`,
      buildLine(this.statusMessage || 'Select an option'),
      buildLine(instructions),
      `├${horizontal}┤`,
      buildLine(debugLine),
      `└${horizontal}┘`,
    ];

    this.clearScreen();
    process.stdout.write(lines.join('\n'));
  }

  private clearScreen(): void {
    process.stdout.write('\x1b[2J\x1b[0f');
  }

  private formatItemLabel(item: MenuItem): string {
    if (!item.shortcut) {
      return item.label;
    }

    return `${item.label} (${item.shortcut.toUpperCase()})`;
  }
}

export default MenuUI;
