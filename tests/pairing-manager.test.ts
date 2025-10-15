import EventEmitter from 'events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MockTlsSocket extends EventEmitter {
  writes: unknown[] = [];
  destroyedWith: Error | undefined;
  certificate = { modulus: 'aa', exponent: '0x01' };
  peerCertificate = { modulus: 'bb', exponent: '0x01' };

  write(payload: unknown) {
    this.writes.push(payload);
    return true;
  }

  destroy(error?: Error) {
    this.destroyedWith = error;
    if (error) {
      this.emit('error', error);
    }
    this.emit('close', Boolean(error));
  }

  getCertificate() {
    return this.certificate;
  }

  getPeerCertificate() {
    return this.peerCertificate;
  }
}

const tlsSockets: MockTlsSocket[] = [];
const tlsConnect = vi.fn((_options, callback?: () => void) => {
  const socket = new MockTlsSocket();
  tlsSockets.push(socket);
  if (callback) {
    callback();
  }
  return socket;
});

const pairingMessages = {
  queue: [] as Array<Record<string, unknown>>,
  createPairingRequest: vi.fn(() => Buffer.from('request')),
  createPairingOption: vi.fn(() => Buffer.from('option')),
  createPairingConfiguration: vi.fn(() => Buffer.from('config')),
  createPairingSecret: vi.fn(() => Buffer.from('secret')),
  parse: vi.fn(() => {
    const payload = pairingMessages.queue.shift() ?? {};
    return {
      ...payload,
      toJSON: () => payload,
    };
  }),
  Status: { STATUS_OK: 'OK' },
};

const cryptoState = {
  finalizeResult: '00',
  shaInstance: {
    update: vi.fn(),
    finalize: vi.fn(() => ({
      toString: () => cryptoState.finalizeResult,
    })),
  },
  hexParse: vi.fn((value: unknown) => value),
};

vi.mock('tls', () => ({
  default: {
    connect: (...args: unknown[]) => tlsConnect(...args),
  },
}));

vi.mock('../src/lib/androidtv-remote/pairing/PairingMessageManager.js', () => ({
  pairingMessageManager: pairingMessages,
}));

vi.mock('crypto-js', () => ({
  default: {
    algo: {
      SHA256: {
        create: () => cryptoState.shaInstance,
      },
    },
    enc: {
      Hex: {
        parse: (value: unknown) => cryptoState.hexParse(value),
      },
    },
  },
}));

describe('PairingManager', () => {
  const buildChunk = () => Buffer.from([3, 1, 2, 3]);

  beforeEach(() => {
    tlsConnect.mockClear();
    tlsSockets.length = 0;
    pairingMessages.queue.length = 0;
    pairingMessages.createPairingRequest.mockClear();
    pairingMessages.createPairingOption.mockClear();
    pairingMessages.createPairingConfiguration.mockClear();
    pairingMessages.createPairingSecret.mockClear();
    pairingMessages.parse.mockClear();
    cryptoState.shaInstance.update.mockClear();
    cryptoState.shaInstance.finalize.mockClear();
    cryptoState.hexParse.mockClear();
    cryptoState.finalizeResult = '00';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('performs pairing handshake and resolves when connection closes cleanly', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { PairingManager } = await import(
      '../src/lib/androidtv-remote/pairing/PairingManager.js'
    );
    const manager = new PairingManager(
      'localhost',
      '6467',
      {
        cert: 'cert',
        key: 'key',
      },
      'Service'
    );
    const secretSpy = vi.fn();
    manager.on('secret', secretSpy);

    const startPromise = manager.start();
    const socket = tlsSockets[0];
    expect(socket).toBeDefined();

    pairingMessages.queue.push(
      { status: pairingMessages.Status.STATUS_OK, pairingRequestAck: true },
      { status: pairingMessages.Status.STATUS_OK, pairingOption: true },
      { status: pairingMessages.Status.STATUS_OK, pairingConfigurationAck: true },
      { status: pairingMessages.Status.STATUS_OK, pairingSecretAck: true }
    );

    socket.emit('secureConnect');
    socket.emit('data', buildChunk());
    socket.emit('data', buildChunk());
    socket.emit('data', buildChunk());
    socket.emit('data', buildChunk());

    await expect(startPromise).resolves.toBe(true);
    expect(secretSpy).toHaveBeenCalledTimes(1);
    expect(socket.destroyedWith).toBeUndefined();
    expect(socket.writes).toEqual([Buffer.from('request'), Buffer.from('option'), Buffer.from('config')]);
    debugSpy.mockRestore();
  });

  it('rejects when pairing message status is not OK', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { PairingManager } = await import(
      '../src/lib/androidtv-remote/pairing/PairingManager.js'
    );
    const manager = new PairingManager(
      'localhost',
      '6467',
      {
        cert: 'cert',
        key: 'key',
      },
      'Service'
    );

    const startPromise = manager.start();
    const socket = tlsSockets[0];

    pairingMessages.queue.push({ status: 'BAD_STATUS' });

    socket.emit('data', buildChunk());

    await expect(startPromise).rejects.toBe(false);
    expect(socket.destroyedWith).toBeInstanceOf(Error);
    expect(socket.destroyedWith?.message).toBe('BAD_STATUS');
    expect(errorSpy).toHaveBeenCalledWith(socket.destroyedWith);
    debugSpy.mockRestore();
  });

  it('sendCode writes secret when checksum matches', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { PairingManager } = await import(
      '../src/lib/androidtv-remote/pairing/PairingManager.js'
    );
    const manager = new PairingManager(
      'localhost',
      '6467',
      {
        cert: 'cert',
        key: 'key',
      },
      'Service'
    );
    const socket = new MockTlsSocket();
    socket.on('error', () => {});
    manager['client'] = socket as unknown as ReturnType<typeof tlsConnect>;

    cryptoState.finalizeResult = '00';

    const result = manager.sendCode('0002');

    expect(result).toBe(true);
    expect(pairingMessages.createPairingSecret).toHaveBeenCalledTimes(1);
    expect(socket.writes).toContainEqual(Buffer.from('secret'));
    debugSpy.mockRestore();
  });

  it('sendCode destroys connection when checksum mismatches', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { PairingManager } = await import(
      '../src/lib/androidtv-remote/pairing/PairingManager.js'
    );
    const manager = new PairingManager(
      'localhost',
      '6467',
      {
        cert: 'cert',
        key: 'key',
      },
      'Service'
    );
    const socket = new MockTlsSocket();
    socket.on('error', () => {});
    manager['client'] = socket as unknown as ReturnType<typeof tlsConnect>;

    cryptoState.finalizeResult = '01';

    const result = manager.sendCode('0002');

    expect(result).toBe(false);
    expect(socket.destroyedWith).toBeInstanceOf(Error);
    expect(socket.destroyedWith?.message).toBe('Bad Code');
    expect(pairingMessages.createPairingSecret).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('throws when certificates are missing before hashing', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { PairingManager } = await import(
      '../src/lib/androidtv-remote/pairing/PairingManager.js'
    );
    const manager = new PairingManager(
      'localhost',
      '6467',
      {
        cert: 'cert',
        key: 'key',
      },
      'Service'
    );
    const socket = new MockTlsSocket();
    socket.getCertificate = () => undefined as never;
    manager['client'] = socket as unknown as ReturnType<typeof tlsConnect>;

    expect(() => manager.sendCode('0002')).toThrowError('No Certificate');
    debugSpy.mockRestore();
  });

  it('logs unexpected messages when status is OK but no flags match', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { PairingManager } = await import(
      '../src/lib/androidtv-remote/pairing/PairingManager.js'
    );
    const manager = new PairingManager(
      'localhost',
      '6467',
      {
        cert: 'cert',
        key: 'key',
      },
      'Service'
    );

    const startPromise = manager.start();
    const socket = tlsSockets[0];

    pairingMessages.queue.push({ status: pairingMessages.Status.STATUS_OK });

    socket.emit('data', Buffer.from([1, 0]));
    socket.emit('close', false);

    await expect(startPromise).resolves.toBe(true);
    expect(debugSpy).toHaveBeenCalledWith('localhost What Else ?');
    debugSpy.mockRestore();
  });

  it('converts hex strings to signed bytes', async () => {
    const { PairingManager } = await import(
      '../src/lib/androidtv-remote/pairing/PairingManager.js'
    );
    const manager = new PairingManager(
      'localhost',
      '6467',
      {
        cert: 'cert',
        key: 'key',
      },
      'Service'
    );

    const bytes = manager['hexStringToBytes']('FF');
    expect(bytes).toEqual([-1]);
  });
});
