import readline from 'readline';
import AppStorage from 'appstoragejs';
import enquirer from 'enquirer';
import { AndroidRemote, RemoteDirection, RemoteKeyCode } from './lib/androidtv-remote';

/*****************************************************************************
 * Initialize Settings Storage
 ****************************************************************************/
const settings = new AppStorage('settings.json');

/*****************************************************************************
 * Options for the connection
 ****************************************************************************/
const options = {
  pairing_port: 6467,
  remote_port: 6466,
  name: 'androidtv-remote',
  cert: settings.cert,
};

/*****************************************************************************
 * Create the AndroidRemote instance
 ****************************************************************************/
const androidRemote = new AndroidRemote(settings.host, options);

type MenuAction = 'mute' | 'power' | 'exit';

type MenuItem = {
  label: string;
  action: MenuAction;
};

const menuItems: MenuItem[] = [
  { label: 'Mute', action: 'mute' },
  { label: 'Power', action: 'power' },
  { label: 'Exit', action: 'exit' },
];

let shuttingDown = false;
let menuRunning = false;
let keypressConfigured = false;
let menuSelectionIndex = 0;
let lastStatusMessage = 'Select an option';
let stopMenu: (() => void) | undefined;
let setMenuStatusMessage: ((message: string) => void) | undefined;

const clearScreen = () => {
  process.stdout.write('\x1b[2J\x1b[0f');
};

const exitApp = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopMenu?.();
  androidRemote.stop();
  process.exit(0);
};

const runMenu = () => {
  if (shuttingDown || menuRunning) {
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log('Interactive menu requires a TTY environment.');
    return;
  }

  if (!keypressConfigured) {
    readline.emitKeypressEvents(process.stdin);
    keypressConfigured = true;
  }

  menuRunning = true;
  process.stdin.resume();
  process.stdin.setRawMode?.(true);

  let statusMessage = lastStatusMessage;
  let selectionIndex = menuSelectionIndex;
  let processingSelection = false;

  const menuTitle = 'Android TV Remote';
  const instructions = '↑/↓ Move  Enter Select  Ctrl+C Exit';

  const render = () => {
    const optionLines = menuItems.map((item, idx) => {
      const prefix = idx === selectionIndex ? '›' : ' ';
      return `${prefix} ${item.label}`;
    });

    const contentWidth = Math.max(
      menuTitle.length,
      instructions.length,
      statusMessage.length,
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
      ...optionLines.map((line, idx) => buildLine(line, idx === selectionIndex)),
      `├${horizontal}┤`,
      buildLine(statusMessage || 'Select an option'),
      buildLine(instructions),
      `└${horizontal}┘`,
    ];

    clearScreen();
    process.stdout.write(lines.join('\n'));
  };

  const setStatus = (message: string) => {
    statusMessage = message;
    lastStatusMessage = message;
  };

  setMenuStatusMessage = (message: string) => {
    setStatus(message);
    render();
  };

  const handleSelection = async (item: MenuItem) => {
    if (processingSelection) {
      return;
    }

    if (item.action === 'exit') {
      setStatus('Closing remote...');
      render();
      exitApp();
      return;
    }

    processingSelection = true;
    try {
      if (item.action === 'mute') {
        androidRemote.sendKey(RemoteKeyCode.KEYCODE_VOLUME_MUTE, RemoteDirection.SHORT);
        setStatus('Mute command sent.');
      } else if (item.action === 'power') {
        androidRemote.sendPower();
        setStatus('Power toggle sent.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Error: ${message}`);
    } finally {
      processingSelection = false;
      render();
    }
  };

  const onKeypress = (_: string, key: readline.Key) => {
    if (key.ctrl && key.name === 'c') {
      exitApp();
      return;
    }

    if (key.name === 'up') {
      selectionIndex = (selectionIndex + menuItems.length - 1) % menuItems.length;
      menuSelectionIndex = selectionIndex;
      render();
      return;
    }

    if (key.name === 'down') {
      selectionIndex = (selectionIndex + 1) % menuItems.length;
      menuSelectionIndex = selectionIndex;
      render();
      return;
    }

    if (key.name === 'return' || key.name === 'enter') {
      void handleSelection(menuItems[selectionIndex]);
    }
  };

  stopMenu = () => {
    if (!menuRunning) {
      return;
    }

    menuRunning = false;
    setMenuStatusMessage = undefined;

    process.stdin.off('keypress', onKeypress);
    process.stdin.setRawMode?.(false);
    process.stdin.pause();
    clearScreen();
    stopMenu = undefined;
  };

  process.stdin.on('keypress', onKeypress);
  render();
};

const promptPairingCode = async (): Promise<string> => {
  process.stdin.resume();
  const { code } = await enquirer.prompt<{ code: string }>({
    type: 'input',
    name: 'code',
    message: 'Enter pairing code:',
    validate: (value) => value.trim().length > 0 || 'Code cannot be empty.',
  });
  return code;
};

/*****************************************************************************
 * Device connection is ready
 ****************************************************************************/
androidRemote.on('ready', async () => {
  const cert = androidRemote.getCertificate();
  settings.cert = cert;

  lastStatusMessage = 'Connected to device.';

  if (!shuttingDown) {
    if (!menuRunning) {
      runMenu();
    }

    setMenuStatusMessage?.('Connected to device.');
  }
});

/*****************************************************************************
 * Handle Pairing
 ****************************************************************************/
androidRemote.on('secret', () => {
  void (async () => {
    if (shuttingDown) {
      return;
    }

    const wasRunning = menuRunning;

    lastStatusMessage = 'Pairing required. Enter the code to continue.';
    setMenuStatusMessage?.('Pairing required. Enter the code to continue.');
    stopMenu?.();

    try {
      const code = await promptPairingCode();
      androidRemote.sendCode(code.trim());
      lastStatusMessage = 'Pairing code sent. Waiting for device...';

      if (wasRunning && !shuttingDown) {
        runMenu();
      }
    } catch (_error) {
      if (!shuttingDown) {
        lastStatusMessage = 'Pairing cancelled.';
        exitApp();
      }
    }
  })();
});

/*****************************************************************************
 * Listen for errors
 ****************************************************************************/
androidRemote.on('error', (error: string) => {
  const message = `Error: ${error}`;
  lastStatusMessage = message;
  setMenuStatusMessage?.(message);
});

process.on('SIGINT', exitApp);
process.on('SIGTERM', exitApp);
process.on('exit', () => {
  stopMenu?.();

  if (!shuttingDown) {
    shuttingDown = true;
    androidRemote.stop();
  }
});

/*****************************************************************************
 * Start the connection to the device
 ****************************************************************************/
await androidRemote.start();
