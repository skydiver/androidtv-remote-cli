import enquirer from 'enquirer';
import { getSetting, setSetting } from './settings';

const ipv4Pattern =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;

export async function ensureHost(): Promise<string> {
  const existingHost = getSetting<string>('host');

  if (existingHost && existingHost.trim().length > 0) {
    return existingHost.trim();
  }

  console.log('Android TV setup: enter the IP address (Ctrl+C to cancel).');

  const { host } = await enquirer.prompt<{ host: string }>([
    {
      type: 'input',
      name: 'host',
      message: 'Enter the Android TV IP Address:',
      validate: (value: string) => {
        const trimmed = value.trim();
        return ipv4Pattern.test(trimmed) || 'Please enter a valid IPv4 address.';
      },
    },
  ]);

  const trimmedHost = host.trim();
  setSetting('host', trimmedHost);
  return trimmedHost;
}

export function abortSetup(error: unknown): never {
  const message =
    error instanceof Error && error.message ? error.message : 'Setup cancelled by user.';
  console.error(`Android TV Remote setup aborted: ${message}`);
  process.exit(1);
}
