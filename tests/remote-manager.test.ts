import EventEmitter from 'events';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MockTlsSocket extends EventEmitter {
  writes: unknown[] = [];
  destroyedWith: Error | undefined;
  timeoutMs: number | undefined;

  setTimeout(ms: number) {
    this.timeoutMs = ms;
  }

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
}

const tlsState = vi.hoisted(() => ({
  sockets: [] as MockTlsSocket[],
  connect: vi.fn((_options, callback?: () => void) => {
    const socket = new MockTlsSocket();
    tlsState.sockets.push(socket);
    if (callback) {
      callback();
    }
    return socket;
  }),
}));

const remoteMessages = vi.hoisted(() => {
  const create = {
    remoteConfigure: vi.fn(() => Buffer.from('configure')),
    remoteSetActive: vi.fn(() => Buffer.from('set-active')),
    remotePingResponse: vi.fn(() => Buffer.from('ping-response')),
    remoteRemoteAppLinkLaunchRequest: vi.fn(() => Buffer.from('app-link')),
    remoteKeyInject: vi.fn(() => Buffer.from('key-inject')),
  };

  const parse = vi.fn(() => ({}));

  return {
    create,
    parse,
    manager: {
      RemoteDirection: { SHORT: 'SHORT' },
      RemoteKeyCode: { KEYCODE_POWER: 'POWER' },
      createRemoteConfigure: create.remoteConfigure,
      createRemoteSetActive: create.remoteSetActive,
      createRemotePingResponse: create.remotePingResponse,
      createRemoteRemoteAppLinkLaunchRequest: create.remoteRemoteAppLinkLaunchRequest,
      createRemoteKeyInject: create.remoteKeyInject,
      parse,
    },
  };
});

vi.mock('tls', () => ({
  default: {
    connect: (...args: unknown[]) => tlsState.connect(...args),
  },
}));

vi.mock('../src/lib/androidtv-remote/remote/RemoteMessageManager.js', () => ({
  remoteMessageManager: remoteMessages.manager,
}));

describe('RemoteManager', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    tlsState.connect.mockClear();
    tlsState.sockets.length = 0;
    Object.values(remoteMessages.create).forEach((fn) => fn.mockClear());
    remoteMessages.parse.mockReset();
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const getManager = async () => {
    const { RemoteManager } = await import('../src/lib/androidtv-remote/remote/RemoteManager.js');
    return new RemoteManager(
      'host',
      6466,
      {
        key: 'key',
        cert: 'cert',
      }
    );
  };

  const emitDelimitedMessage = (socket: MockTlsSocket, message: Record<string, unknown>) => {
    remoteMessages.parse.mockImplementationOnce(() => ({
      ...message,
      toJSON: () => message,
    }));
    const buffer = Buffer.from([3, 1, 2, 3]);
    socket.emit('data', buffer);
  };

  it('resolves on secure connect and handles configure handshake', async () => {
    const readySpy = vi.fn();
    const manager = await getManager();
    manager.on('ready', readySpy);

    const startPromise = manager.start();
    const socket = tlsState.sockets[0];
    expect(socket.timeoutMs).toBe(10000);

    socket.emit('secureConnect');
    emitDelimitedMessage(socket, { remoteConfigure: { val: 1 } });

    await expect(startPromise).resolves.toBe(true);
    expect(remoteMessages.create.remoteConfigure).toHaveBeenCalled();
    expect(readySpy).toHaveBeenCalled();
    expect(socket.writes).toContainEqual(Buffer.from('configure'));
  });

  it('handles remote messages and emits appropriate events', async () => {
    const manager = await getManager();
    const currentAppSpy = vi.fn();
    const poweredSpy = vi.fn();
    const volumeSpy = vi.fn();
    const remoteErrorSpy = vi.fn();
    manager.on('current_app', currentAppSpy);
    manager.on('powered', poweredSpy);
    manager.on('volume', volumeSpy);
    manager.on('error', remoteErrorSpy);

    const startPromise = manager.start();
    const socket = tlsState.sockets[0];
    socket.emit('secureConnect');
    await expect(startPromise).resolves.toBe(true);

    emitDelimitedMessage(socket, { remoteSetActive: { id: 1 } });
    expect(remoteMessages.create.remoteSetActive).toHaveBeenCalledWith(622);
    expect(socket.writes).toContainEqual(Buffer.from('set-active'));

    emitDelimitedMessage(socket, { remotePingRequest: { val1: 9 } });
    expect(remoteMessages.create.remotePingResponse).toHaveBeenCalledWith(9);
    expect(socket.writes).toContainEqual(Buffer.from('ping-response'));

    emitDelimitedMessage(socket, { remoteImeKeyInject: { appInfo: { appPackage: 'app.pkg' } } });
    expect(currentAppSpy).toHaveBeenCalledWith('app.pkg');

    emitDelimitedMessage(socket, { remoteImeBatchEdit: 'edit' });
    expect(debugSpy).toHaveBeenCalledWith('Receive IME BATCH EDIT' + 'edit');

    emitDelimitedMessage(socket, { remoteImeShowRequest: 'show' });
    expect(debugSpy).toHaveBeenCalledWith('Receive IME SHOW REQUEST' + 'show');

    emitDelimitedMessage(socket, { remoteVoiceBegin: {} });
    emitDelimitedMessage(socket, { remoteVoicePayload: {} });
    emitDelimitedMessage(socket, { remoteVoiceEnd: {} });

    emitDelimitedMessage(socket, { remoteStart: { started: false } });
    expect(poweredSpy).toHaveBeenCalledWith(false);

    emitDelimitedMessage(socket, {
      remoteSetVolumeLevel: {
        volumeLevel: 5,
        volumeMax: 10,
        volumeMuted: true,
        playerModel: 'Player',
      },
    });
    expect(volumeSpy).toHaveBeenCalledWith({
      level: 5,
      maximum: 10,
      muted: true,
      playerModel: 'Player',
    });

    emitDelimitedMessage(socket, { remoteSetPreferredAudioDevice: { device: 'speaker' } });

    emitDelimitedMessage(socket, { remoteError: { code: 500 } });
    expect(remoteErrorSpy).toHaveBeenCalledWith({ error: { code: 500 } });

    emitDelimitedMessage(socket, { unknownField: true });
    expect(logSpy).toHaveBeenCalledWith('What else ?');
  });

  it('destroys connection on timeout', async () => {
    vi.useFakeTimers();
    const manager = await getManager();
    const originalStart = manager.start.bind(manager);
    let callCount = 0;
    const startSpy = vi.spyOn(manager, 'start');
    startSpy.mockImplementation(function (this: typeof manager, ...args: unknown[]) {
      callCount += 1;
      if (callCount === 1) {
        return originalStart(...args);
      }
      return Promise.resolve(true);
    });

    const startPromise = manager.start();
    const socket = tlsState.sockets[0];
    socket.emit('secureConnect');
    await expect(startPromise).resolves.toBe(true);

    socket.emit('timeout');
    await vi.runAllTimersAsync();

    expect(socket.destroyedWith).toBeUndefined();
    expect(startSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('emits unpaired when connection closes with ECONNRESET', async () => {
    const manager = await getManager();
    const unpairedSpy = vi.fn();
    manager.on('unpaired', unpairedSpy);

    const startPromise = manager.start();
    const socket = tlsState.sockets[0];
    const error = { code: 'ECONNRESET' } as NodeJS.ErrnoException;
    socket.emit('error', error);
    socket.emit('close', true);

    await expect(startPromise).rejects.toBe('ECONNRESET');
    expect(unpairedSpy).toHaveBeenCalledTimes(1);
  });

  it('retries when connection closes with ECONNREFUSED', async () => {
    vi.useFakeTimers();
    const manager = await getManager();
    const originalStart = manager.start.bind(manager);
    let callCount = 0;
    const restartError = new Error('restart fail');
    const startSpy = vi.spyOn(manager, 'start');
    startSpy.mockImplementation(function (this: typeof manager, ...args: unknown[]) {
      callCount += 1;
      if (callCount === 1) {
        return originalStart(...args);
      }
      return Promise.reject(restartError);
    });

    const startPromise = manager.start();
    const socket = tlsState.sockets[0];
    const error = { code: 'ECONNREFUSED' } as NodeJS.ErrnoException;
    socket.emit('error', error);
    socket.emit('close', true);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    await expect(startPromise).rejects.toBe('ECONNREFUSED');
    expect(startSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(restartError);
    vi.useRealTimers();
  });

  it('retries and logs on unexpected error codes', async () => {
    vi.useFakeTimers();
    const manager = await getManager();
    const originalStart = manager.start.bind(manager);
    let callCount = 0;
    const restartError = new Error('unexpected');
    const startSpy = vi.spyOn(manager, 'start');
    startSpy.mockImplementation(function (this: typeof manager, ...args: unknown[]) {
      callCount += 1;
      if (callCount === 1) {
        return originalStart(...args);
      }
      return Promise.reject(restartError);
    });

    const startPromise = manager.start();
    const socket = tlsState.sockets[0];
    const error = { code: 'ESOMETHING' } as NodeJS.ErrnoException;
    socket.emit('error', error);
    socket.emit('close', true);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    await expect(startPromise).rejects.toBe('ESOMETHING');
    expect(startSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(restartError);
    vi.useRealTimers();
  });

  it('does not restart when host is down', async () => {
    const manager = await getManager();
    const originalStart = manager.start.bind(manager);
    let callCount = 0;
    const startSpy = vi.spyOn(manager, 'start');
    startSpy.mockImplementation(function (this: typeof manager, ...args: unknown[]) {
      callCount += 1;
      if (callCount === 1) {
        return originalStart(...args);
      }
      return Promise.resolve(true);
    });

    const startPromise = manager.start();
    const socket = tlsState.sockets[0];
    const error = { code: 'EHOSTDOWN' } as NodeJS.ErrnoException;
    socket.emit('error', error);
    socket.emit('close', true);

    await expect(startPromise).rejects.toBe('EHOSTDOWN');
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('restarts after clean close', async () => {
    vi.useFakeTimers();
    const manager = await getManager();
    const originalStart = manager.start.bind(manager);
    let callCount = 0;
    const restartError = new Error('clean restart fail');
    const startSpy = vi.spyOn(manager, 'start');
    startSpy.mockImplementation(function (this: typeof manager, ...args: unknown[]) {
      callCount += 1;
      if (callCount === 1) {
        return originalStart(...args);
      }
      return Promise.reject(restartError);
    });

    const startPromise = manager.start();
    const socket = tlsState.sockets[0];
    socket.emit('secureConnect');
    await expect(startPromise).resolves.toBe(true);

    socket.emit('close', false);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(startSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(restartError);
    vi.useRealTimers();
  });

  it('records error codes from tls error event', async () => {
    const manager = await getManager();
    const startPromise = manager.start();
    const socket = tlsState.sockets[0];
    const error = { code: 'ERR' } as NodeJS.ErrnoException;
    socket.emit('error', error);
    expect(errorSpy).toHaveBeenCalledWith('host', error);
    socket.emit('close', true);
    await expect(startPromise).rejects.toBe('ERR');
  });

  it('sends power, key, and app link commands, and stops gracefully', async () => {
    const manager = await getManager();
    const socket = new MockTlsSocket();
    manager['client'] = socket as unknown as ReturnType<typeof tlsState.connect>;

    manager.sendPower();
    expect(remoteMessages.create.remoteKeyInject).toHaveBeenCalledWith(
      remoteMessages.manager.RemoteDirection.SHORT,
      remoteMessages.manager.RemoteKeyCode.KEYCODE_POWER
    );
    expect(socket.writes).toContainEqual(Buffer.from('key-inject'));

    manager.sendKey('ENTER', 'LONG');
    expect(remoteMessages.create.remoteKeyInject).toHaveBeenCalledWith('LONG', 'ENTER');
    expect(remoteMessages.create.remoteKeyInject).toHaveBeenCalledTimes(2);

    manager.sendAppLink('app://launch');
    expect(remoteMessages.create.remoteRemoteAppLinkLaunchRequest).toHaveBeenCalledWith(
      'app://launch'
    );
    expect(socket.writes).toContainEqual(Buffer.from('app-link'));

    socket.destroyedWith = undefined;
    manager.stop();
    expect(socket.destroyedWith).toBeUndefined();
  });
});
