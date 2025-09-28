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

let menuActive = false;
let shuttingDown = false;

const exitApp = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  androidRemote.stop();
  process.exit(0);
};

const runMenu = async () => {
  const promptAction = async (): Promise<MenuAction> => {
    const { action } = await enquirer.prompt<{ action: MenuAction }>({
      type: 'select',
      name: 'action',
      message: 'Android TV Remote',
      choices: [
        { name: 'mute', message: 'Mute', value: 'mute' satisfies MenuAction },
        { name: 'power', message: 'Power', value: 'power' satisfies MenuAction },
        { name: 'exit', message: 'Exit', value: 'exit' satisfies MenuAction },
      ],
    });

    return action;
  };

  while (!shuttingDown) {
    try {
      const choice = await promptAction();

      if (choice === 'mute') {
        androidRemote.sendKey(RemoteKeyCode.KEYCODE_VOLUME_MUTE, RemoteDirection.SHORT);
        console.log('Mute command sent.');
        continue;
      }

      if (choice === 'power') {
        androidRemote.sendPower();
        console.log('Power toggle sent.');
        continue;
      }

      if (choice === 'exit') {
        exitApp();
        break;
      }
    } catch (_error) {
      if (!shuttingDown) {
        console.error('Menu cancelled.');
        exitApp();
      }
    }
  }
};

/*****************************************************************************
 * Device connection is ready
 ****************************************************************************/
androidRemote.on('ready', async () => {
  const cert = androidRemote.getCertificate();
  settings.cert = cert;

  if (!menuActive) {
    menuActive = true;
    void runMenu();
  }
});

/*****************************************************************************
 * Handle Pairing
 ****************************************************************************/
androidRemote.on('secret', () => {
  void (async () => {
    try {
      const { code } = await enquirer.prompt<{ code: string }>({
        type: 'input',
        name: 'code',
        message: 'Code:',
      });

      androidRemote.sendCode(code.trim());
    } catch (_error) {
      if (!shuttingDown) {
        console.error('Pairing cancelled.');
        exitApp();
      }
    }
  })();
});

/*****************************************************************************
 * Listen for errors
 ****************************************************************************/
androidRemote.on('error', (error: string) => {
  console.error('Error : ' + error);
});

process.on('SIGINT', exitApp);
process.on('SIGTERM', exitApp);
process.on('exit', () => {
  if (!shuttingDown) {
    androidRemote.stop();
  }
});

/*****************************************************************************
 * Start the connection to the device
 ****************************************************************************/
await androidRemote.start();
