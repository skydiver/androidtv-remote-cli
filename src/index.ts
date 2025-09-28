import AppStorage from 'appstoragejs';
import { AndroidRemote, RemoteDirection, RemoteKeyCode } from './lib/androidtv-remote';
import MenuUI, { type MenuAction, type MenuItem } from './ui/menu';

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
  if (action === 'exit') {
    menu.setStatus('Closing remote...');
    exitApp();
    return;
  }

  if (action === 'mute') {
    androidRemote.sendKey(RemoteKeyCode.KEYCODE_VOLUME_MUTE, RemoteDirection.SHORT);
    return 'Mute command sent.';
  }

  if (action === 'power') {
    androidRemote.sendPower();
    return 'Power toggle sent.';
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
