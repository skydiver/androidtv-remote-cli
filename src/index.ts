import AppStorage from 'appstoragejs';
import { AndroidRemote } from './lib/androidtv-remote';
import MenuUI, { type MenuAction, type MenuItem } from './ui/menu';
import {
  homeCommand,
  exitCommand,
  muteCommand,
  powerCommand,
} from './ui/menu-commands';
import DpadModeController from './ui/dpad-mode';
import { isDebugMode, setDebugMode } from './debug';
import HelpScreenController from './ui/help';

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

type PendingMode = 'dpad' | 'help' | null;

const cliArgs = process.argv.slice(2);
const primaryCommand = cliArgs[0];
let pendingMode: PendingMode = primaryCommand === 'dpad' ? 'dpad' : primaryCommand === 'help' ? 'help' : null;

const menuItems: MenuItem[] = [
  { label: '🎮  D-pad Controls', action: 'dpad' },
  { label: '🏠  Home', action: 'home' },
  { label: '🔇  Mute', action: 'mute' },
  { label: '🔌  Power', action: 'power' },
  { label: '🐞  Debug', action: 'debug' },
  { label: 'ℹ️  Help', action: 'help' },
  { label: '🚪  Exit', action: 'exit' },
];

let shuttingDown = false;
const menu = new MenuUI({
  items: menuItems,
  onAction: handleMenuAction,
});

let dpadMode: DpadModeController | null = null;
let helpScreen: HelpScreenController | null = null;
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
  helpScreen?.exit(false);
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

helpScreen = new HelpScreenController({
  menu,
  exitApp,
  formatStatus,
});

setDebugMode(false);

if (pendingMode === 'help') {
  pendingMode = null;
  helpScreen.start();
}

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
    case 'help':
      helpScreen?.start();
      return;
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
    if (pendingMode === 'dpad') {
      pendingMode = null;
      dpadMode?.start();
    } else if (pendingMode === 'help') {
      pendingMode = null;
      helpScreen?.start();
    } else if (!dpadMode?.isActive() && !helpScreen?.isActive()) {
      menu.start();
    }
  }
});

androidRemote.on('volume', (volumeInfo: { playerModel?: string } | undefined) => {
  if (!volumeInfo?.playerModel) {
    return;
  }

  dpadMode?.setHeaderLabel(volumeInfo.playerModel);
  menu.setHeaderLabel(volumeInfo.playerModel);
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
    const wasInHelpMode = helpScreen?.isActive() ?? false;

    menu.setStatus(formatStatus('Pairing required. Enter the code to continue.'));
    if (dpadMode?.isActive()) {
      dpadMode.exit(false);
    }
    if (helpScreen?.isActive()) {
      helpScreen.exit(false);
    }
    menu.stop();
    if (pendingMode === null) {
      if (wasInDpadMode) {
        pendingMode = 'dpad';
      } else if (wasInHelpMode) {
        pendingMode = 'help';
      }
    }

    try {
      const code = await menu.promptPairingCode();
      androidRemote.sendCode(code.trim());

      if (!shuttingDown) {
        menu.setStatus(formatStatus('Pairing code sent. Waiting for device...'));
        if (pendingMode === null && (wasRunning || wasInDpadMode || wasInHelpMode)) {
          menu.start();
        }
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
  helpScreen?.exit(false);
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
