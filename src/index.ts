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
  { label: 'D-pad Up', action: 'dpad-up' },
  { label: 'D-pad Down', action: 'dpad-down' },
  { label: 'D-pad Left', action: 'dpad-left' },
  { label: 'D-pad Right', action: 'dpad-right' },
  { label: 'Enter', action: 'enter' },
  { label: 'Select', action: 'select' },
  { label: 'Exit', action: 'exit' },
];

let shuttingDown = false;
const menu = new MenuUI({
  items: menuItems,
  onAction: handleMenuAction,
});

function exitApp() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  menu.stop();
  androidRemote.stop();
  process.exit(0);
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
    case 'dpad-up':
      return dpadUpCommand(androidRemote);
    case 'dpad-down':
      return dpadDownCommand(androidRemote);
    case 'dpad-left':
      return dpadLeftCommand(androidRemote);
    case 'dpad-right':
      return dpadRightCommand(androidRemote);
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
    menu.start();
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

    menu.setStatus('Pairing required. Enter the code to continue.');
    menu.stop();

    try {
      const code = await menu.promptPairingCode();
      androidRemote.sendCode(code.trim());

      if (wasRunning && !shuttingDown) {
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
