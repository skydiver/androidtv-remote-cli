import readline from 'readline';
import AppStorage from 'appstoragejs';
import { AndroidRemote } from './lib/androidtv-remote';
import MenuUI, { type MenuAction, type MenuItem } from './ui/menu';
import {
  dpadDownCommand,
  dpadLeftCommand,
  dpadRightCommand,
  dpadUpCommand,
  enterCommand,
  exitCommand,
  muteCommand,
  powerCommand,
  selectCommand,
} from './ui/menu-commands';

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

const menuItems: MenuItem[] = [
  { label: 'Mute', action: 'mute' },
  { label: 'Power', action: 'power' },
  { label: 'Enter', action: 'enter' },
  { label: 'Select', action: 'select' },
  { label: 'D-pad Controls', action: 'dpad' },
  { label: 'Exit', action: 'exit' },
];

let shuttingDown = false;
let dpadModeActive = false;
let dpadKeypressHandler: ((chunk: string, key: readline.Key) => void) | undefined;
const menu = new MenuUI({
  items: menuItems,
  onAction: handleMenuAction,
});

function exitApp() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  exitDpadMode(false);
  menu.stop();
  androidRemote.stop();
  process.exit(0);
}

function startDpadMode(): void {
  if (dpadModeActive) {
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    menu.setStatus('D-pad mode requires a TTY environment.');
    if (!menu.isRunning()) {
      menu.start();
    }
    return;
  }

  dpadModeActive = true;
  menu.stop();

  readline.emitKeypressEvents(process.stdin);
  process.stdin.resume();
  process.stdin.setRawMode?.(true);

  console.clear();
  console.log('──────────────────────────────────────────────');
  console.log(' D-pad Mode');
  console.log('──────────────────────────────────────────────');
  console.log('Use the arrow keys to control the TV.');
  console.log('Space → Enter');
  console.log('Enter/Return → Select');
  console.log('Esc → Back to menu');
  console.log('Ctrl+C → Exit app');
  console.log('──────────────────────────────────────────────');

  dpadKeypressHandler = (_chunk, key) => {
    if (!key) {
      return;
    }

    if (key.ctrl && key.name === 'c') {
      exitApp();
      return;
    }

    if (key.name === 'escape') {
      exitDpadMode();
      return;
    }

    switch (key.name) {
      case 'up':
        console.log('↑ D-pad Up');
        dpadUpCommand(androidRemote);
        break;
      case 'down':
        console.log('↓ D-pad Down');
        dpadDownCommand(androidRemote);
        break;
      case 'left':
        console.log('← D-pad Left');
        dpadLeftCommand(androidRemote);
        break;
      case 'right':
        console.log('→ D-pad Right');
        dpadRightCommand(androidRemote);
        break;
      case 'space':
        console.log('␠ Enter command');
        enterCommand(androidRemote);
        break;
      case 'return':
      case 'enter':
        console.log('⏎ Select command');
        selectCommand(androidRemote);
        break;
      default:
        if (key.sequence === ' ') {
          console.log('␠ Enter command');
          enterCommand(androidRemote);
        }
        break;
    }
  };

  process.stdin.on('keypress', dpadKeypressHandler);
}

function exitDpadMode(shouldRestartMenu = true): void {
  if (!dpadModeActive) {
    return;
  }

  if (dpadKeypressHandler) {
    process.stdin.off('keypress', dpadKeypressHandler);
    dpadKeypressHandler = undefined;
  }

  process.stdin.setRawMode?.(false);
  process.stdin.pause();

  dpadModeActive = false;

  if (shouldRestartMenu && !shuttingDown) {
    console.clear();
    console.log('Returning to menu...');
    menu.setStatus('Exited D-pad mode.');
    menu.start();
  }
}

async function handleMenuAction(action: MenuAction): Promise<string | void> {
  switch (action) {
    case 'exit':
      exitCommand(menu, exitApp);
      return;
    case 'mute':
      return muteCommand(androidRemote);
    case 'power':
      return powerCommand(androidRemote);
    case 'dpad':
      startDpadMode();
      return;
    case 'enter':
      return enterCommand(androidRemote);
    case 'select':
      return selectCommand(androidRemote);
    default:
      return;
  }
}

/*****************************************************************************
 * Device connection is ready
 ****************************************************************************/
androidRemote.on('ready', async () => {
  const cert = androidRemote.getCertificate();
  settings.cert = cert;

  if (!shuttingDown) {
    menu.setStatus('Connected to device.');
    if (!dpadModeActive) {
      menu.start();
    }
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

    const wasRunning = menu.isRunning();
    const wasInDpadMode = dpadModeActive;

    menu.setStatus('Pairing required. Enter the code to continue.');
    if (dpadModeActive) {
      exitDpadMode(false);
    }
    menu.stop();

    try {
      const code = await menu.promptPairingCode();
      androidRemote.sendCode(code.trim());

      if ((wasRunning || wasInDpadMode) && !shuttingDown) {
        menu.setStatus('Pairing code sent. Waiting for device...');
        menu.start();
      }
    } catch (_error) {
      if (!shuttingDown) {
        menu.setStatus('Pairing cancelled.');
        exitApp();
      }
    }
  })();
});

/*****************************************************************************
 * Listen for errors
 ****************************************************************************/
androidRemote.on('error', (error: string) => {
  menu.setStatus(`Error: ${error}`);
});

process.on('SIGINT', exitApp);
process.on('SIGTERM', exitApp);
process.on('exit', () => {
  exitDpadMode(false);
  menu.stop();

  if (!shuttingDown) {
    shuttingDown = true;
    androidRemote.stop();
  }
});

/*****************************************************************************
 * Start the connection to the device
 ****************************************************************************/
await androidRemote.start();
