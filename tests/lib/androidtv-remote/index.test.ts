import EventEmitter from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  generateFull: vi.fn(() => ({ key: 'generated-key', cert: 'generated-cert' })),
  pairingStartResult: true,
  remoteStartResult: true,
  pairingInstances: [] as Array<{ host: string; port: number; cert: unknown; service: string }>,
  remoteInstances: [] as Array<{ host: string; port: number; cert: unknown }>,
  pairingSendCode: vi.fn(),
  remoteSendPower: vi.fn(),
  remoteSendKey: vi.fn(),
  remoteSendAppLink: vi.fn(),
  remoteStop: vi.fn(),
}));

vi.mock('~/lib/androidtv-remote/certificate/CertificateGenerator.js', () => ({
  CertificateGenerator: {
    generateFull: (...args: unknown[]) => mockState.generateFull(...args),
  },
}));

vi.mock('~/lib/androidtv-remote/pairing/PairingManager.js', () => {
  return {
    PairingManager: class PairingManager extends EventEmitter {
      host: string;
      port: number;
      cert: unknown;
      service: string;

      constructor(host: string, port: number, cert: unknown, service: string) {
        super();
        this.host = host;
        this.port = port;
        this.cert = cert;
        this.service = service;
        mockState.pairingInstances.push({ host, port, cert, service });
      }

      start() {
        const result = mockState.pairingStartResult;
        return typeof (result as Promise<unknown>)?.then === 'function'
          ? (result as Promise<boolean>)
          : Promise.resolve(result as boolean);
      }

      sendCode(code: string) {
        mockState.pairingSendCode(code);
      }
    },
  };
});

vi.mock('~/lib/androidtv-remote/remote/RemoteManager.js', () => {
  return {
    RemoteManager: class RemoteManager extends EventEmitter {
      host: string;
      port: number;
      cert: unknown;

      constructor(host: string, port: number, cert: unknown) {
        super();
        this.host = host;
        this.port = port;
        this.cert = cert;
        mockState.remoteInstances.push({ host, port, cert });
      }

      start() {
        const result = mockState.remoteStartResult;
        return typeof (result as Promise<unknown>)?.then === 'function'
          ? (result as Promise<unknown>)
          : Promise.resolve(result);
      }

      sendPower() {
        mockState.remoteSendPower();
      }

      sendAppLink(link: string) {
        mockState.remoteSendAppLink(link);
      }

      sendKey(key: unknown, direction: unknown) {
        mockState.remoteSendKey(key, direction);
      }

      stop() {
        mockState.remoteStop();
      }
    },
  };
});

vi.mock('~/lib/androidtv-remote/remote/RemoteMessageManager.js', () => ({
  remoteMessageManager: {
    RemoteKeyCode: { A: 'A' },
    RemoteDirection: { SHORT: 'SHORT' },
  },
}));

describe('AndroidRemote', () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.generateFull.mockClear();
    mockState.pairingInstances.length = 0;
    mockState.remoteInstances.length = 0;
    mockState.pairingSendCode.mockClear();
    mockState.remoteSendAppLink.mockClear();
    mockState.remoteSendKey.mockClear();
    mockState.remoteSendPower.mockClear();
    mockState.remoteStop.mockClear();
    mockState.pairingStartResult = true;
    mockState.remoteStartResult = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates certificate and forwards events when starting without existing cert', async () => {
    vi.useFakeTimers();
    const { AndroidRemote } = await import('~/lib/androidtv-remote/index.js');

    const remote = new AndroidRemote('192.168.1.100', {
      pairing_port: 7000,
      remote_port: 7001,
      service_name: 'My Remote',
      cert: undefined,
    });

    mockState.pairingStartResult = true;
    mockState.remoteStartResult = () => Promise.resolve('started');

    const readySpy = vi.fn();
    const secretSpy = vi.fn();
    remote.on('ready', readySpy);
    remote.on('secret', secretSpy);

    const startPromise = remote.start();
    await vi.runAllTimersAsync();
    await startPromise;

    expect(mockState.generateFull).toHaveBeenCalled();
    expect(mockState.pairingInstances).toHaveLength(1);
    expect(mockState.remoteInstances).toHaveLength(1);

    const pairingInstance = mockState.pairingInstances[0];
    expect(pairingInstance.host).toBe('192.168.1.100');
    expect(pairingInstance.port).toBe(7000);

    const pairingEmitter = remote['pairingManager'] as EventEmitter | undefined;
    pairingEmitter?.emit('secret');
    expect(secretSpy).toHaveBeenCalled();

    const remoteEmitter = remote['remoteManager'] as EventEmitter | undefined;
    remoteEmitter?.emit('powered', true);
    expect(readySpy).not.toHaveBeenCalled();
    remoteEmitter?.emit('ready');
    expect(readySpy).toHaveBeenCalled();
  });

  it('skips pairing when cert is provided and exposes RemoteKeyCode/Direction', async () => {
    vi.useFakeTimers();
    const module = await import('~/lib/androidtv-remote/index.js');
    const { AndroidRemote, RemoteKeyCode, RemoteDirection } = module;

    const remote = new AndroidRemote('host.local', {
      cert: { key: 'key', cert: 'cert' },
    });

    mockState.remoteStartResult = true;
    const startPromise = remote.start();
    await vi.runAllTimersAsync();
    await startPromise;

    expect(mockState.generateFull).not.toHaveBeenCalled();
    expect(mockState.pairingInstances).toHaveLength(0);
    expect(RemoteKeyCode).toEqual({ A: 'A' });
    expect(RemoteDirection).toEqual({ SHORT: 'SHORT' });
  });

  it('returns early when pairing fails', async () => {
    vi.useFakeTimers();
    const { AndroidRemote } = await import('~/lib/androidtv-remote/index.js');

    mockState.pairingStartResult = false;
    const remote = new AndroidRemote('host', {} as never);

    const resultPromise = remote.start();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBeUndefined();
    expect(mockState.remoteInstances).toHaveLength(0);
  });

  it('logs and stops when pairing start throws', async () => {
    vi.useFakeTimers();
    const { AndroidRemote } = await import('~/lib/androidtv-remote/index.js');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockState.pairingStartResult = () => Promise.reject(new Error('pairing failure'));
    mockState.remoteStartResult = true;
    const remote = new AndroidRemote('host', {} as never);

    const startPromise = remote.start();
    await vi.runAllTimersAsync();
    const result = await startPromise;

    expect(await Promise.resolve(result)).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    expect(mockState.remoteInstances).toHaveLength(0);
  });

  it('logs and continues when remote manager start throws', async () => {
    vi.useFakeTimers();
    const { AndroidRemote } = await import('~/lib/androidtv-remote/index.js');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockState.pairingStartResult = true;
    mockState.remoteStartResult = () => Promise.reject(new Error('remote failure'));

    const remote = new AndroidRemote('host', {} as never);
    const startPromise = remote.start();
    await vi.runAllTimersAsync();
    const result = await startPromise;

    expect(await Promise.resolve(result)).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    expect(mockState.remoteInstances).toHaveLength(1);
  });

  it('logs and stops when pairing manager start rejects', async () => {
    vi.useFakeTimers();
    const { AndroidRemote } = await import('~/lib/androidtv-remote/index.js');
    const error = new Error('pairing rejection');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const rejection = Promise.reject(error);
    rejection.catch(() => {});
    mockState.pairingStartResult = rejection;

    const remote = new AndroidRemote('host', {} as never);
    const startPromise = remote.start();

    await vi.runAllTimersAsync();
    const result = await startPromise;

    expect(result).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(error);
    expect(mockState.remoteInstances).toHaveLength(0);
  });

  it('runs cleanup when pairing manager start resolves to function', async () => {
    vi.useFakeTimers();
    const { AndroidRemote } = await import('~/lib/androidtv-remote/index.js');
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockState.pairingStartResult = Promise.resolve(cleanup);

    const remote = new AndroidRemote('host', {} as never);
    const startPromise = remote.start();

    await vi.runAllTimersAsync();
    const result = await startPromise;

    expect(result).toBeUndefined();
    expect(cleanup).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(mockState.remoteInstances).toHaveLength(0);
  });

  it('delegates send methods and stop', async () => {
    vi.useFakeTimers();
    const { AndroidRemote } = await import('~/lib/androidtv-remote/index.js');

    const remote = new AndroidRemote('host', {} as never);
    const startPromise = remote.start();
    await vi.runAllTimersAsync();
    await startPromise;

    remote.sendCode('1234');
    remote.sendPower();
    remote.sendKey('Enter', 'SHORT');
    remote.sendAppLink('app://id');
    remote.stop();

    expect(mockState.pairingSendCode).toHaveBeenCalledWith('1234');
    expect(mockState.remoteSendPower).toHaveBeenCalled();
    expect(mockState.remoteSendKey).toHaveBeenCalledWith('Enter', 'SHORT');
    expect(mockState.remoteSendAppLink).toHaveBeenCalledWith('app://id');
    expect(mockState.remoteStop).toHaveBeenCalled();
  });

  it('returns certificate snapshot', async () => {
    vi.useFakeTimers();
    const { AndroidRemote } = await import('~/lib/androidtv-remote/index.js');

    const remote = new AndroidRemote('host', {
      cert: { key: 'initial-key', cert: 'initial-cert' },
    });

    const snapshot = remote.getCertificate();
    expect(snapshot).toEqual({ key: 'initial-key', cert: 'initial-cert' });
  });
});
