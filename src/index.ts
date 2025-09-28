import AppStorage from 'appstoragejs';
import { AndroidRemote } from './lib/androidtv-remote';
import MenuUI, { type MenuAction, type MenuItem } from './ui/menu';
import {
  homeCommand,
  enterCommand,
  exitCommand,
  muteCommand,
  powerCommand,
} from './ui/menu-commands';
import DpadModeController from './ui/dpad-mode';
import { isDebugMode, setDebugMode } from './debug';

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
  { label: '🔇  Mute', action: 'mute' },
  { label: '🔌  Power', action: 'power' },
  { label: '🏠  Home', action: 'home' },
  { label: '🐞  Debug', action: 'debug' },
  { label: '⏎  Enter', action: 'enter' },
  { label: '🎮  D-pad Controls', action: 'dpad' },
  { label: '🚪  Exit', action: 'exit' },
];

let shuttingDown = false;
const menu = new MenuUI({
  items: menuItems,
  onAction: handleMenuAction,
});

let dpadMode: DpadModeController | null = null;
let lastStatusBase = 'Select an option';

function formatStatus(message?: string): string {
  if (message !== undefined) {
    lastStatusBase = message;
  }
  return `${lastStatusBase} (Debug: ${isDebugMode() ? 'On' : 'Off'})`;
}

function toggleDebugMode(): string {
  const next = !isDebugMode();
  setDebugMode(next);
  return formatStatus(`Debug ${next ? 'enabled' : 'disabled'}.`);
}

function exitApp() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  dpadMode?.exit(false);
  menu.stop();
  androidRemote.stop();
  process.exit(0);
}

dpadMode = new DpadModeController({
  remote: androidRemote,
  menu,
  exitApp,
  formatStatus,
});

setDebugMode(false);

async function handleMenuAction(action: MenuAction): Promise<string | void> {
  switch (action) {
    case 'exit':
      exitCommand(menu, exitApp);
      return;
    case 'mute':
      return formatStatus(muteCommand(androidRemote));
    case 'power':
      return formatStatus(powerCommand(androidRemote));
    case 'home':
      return formatStatus(homeCommand(androidRemote));
    case 'debug':
      return toggleDebugMode();
    case 'dpad':
      dpadMode?.start();
      return;
    case 'enter':
      return formatStatus(enterCommand(androidRemote));
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
    menu.setStatus(formatStatus('Connected to device.'));
    if (!dpadMode?.isActive()) {
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
    const wasInDpadMode = dpadMode?.isActive() ?? false;

    menu.setStatus(formatStatus('Pairing required. Enter the code to continue.'));
    if (dpadMode?.isActive()) {
      dpadMode.exit(false);
    }
    menu.stop();

    try {
      const code = await menu.promptPairingCode();
      androidRemote.sendCode(code.trim());

      if ((wasRunning || wasInDpadMode) && !shuttingDown) {
        menu.setStatus(formatStatus('Pairing code sent. Waiting for device...'));
        menu.start();
      }
    } catch (_error) {
      if (!shuttingDown) {
        menu.setStatus(formatStatus('Pairing cancelled.'));
        exitApp();
      }
    }
  })();
});

/*****************************************************************************
 * Listen for errors
 ****************************************************************************/
androidRemote.on('error', (error: string) => {
  menu.setStatus(formatStatus(`Error: ${error}`));
});

process.on('SIGINT', exitApp);
process.on('SIGTERM', exitApp);
process.on('exit', () => {
  dpadMode?.exit(false);
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
