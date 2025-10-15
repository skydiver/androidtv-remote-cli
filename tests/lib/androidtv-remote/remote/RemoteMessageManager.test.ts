import { beforeEach, describe, expect, it, vi } from 'vitest';

const protoState = vi.hoisted(() => {
  const enums = {
    'remote.RemoteKeyCode': { KEYCODE_POWER: 26 },
    'remote.RemoteDirection': { SHORT: 1 },
  };

  const verify = vi.fn(() => null);
  const create = vi.fn((payload) => ({
    ...payload,
    toJSON: () => payload,
  }));
  const encodeFinish = vi.fn(() => Uint8Array.from([1, 2, 3]));
  const encodeDelimited = vi.fn(() => ({ finish: encodeFinish }));
  const decodeDelimited = vi.fn((buffer) => ({ decoded: buffer }));

  const type = {
    verify,
    create,
    encodeDelimited,
    decodeDelimited,
  };

  const lookupType = vi.fn(() => type);
  const lookupEnum = vi.fn((name) => ({ values: enums[name] ?? {} }));

  const parse = vi.fn(() => ({
    root: {
      lookupType,
      lookupEnum,
    },
  }));

  return {
    enums,
    verify,
    create,
    encodeFinish,
    encodeDelimited,
    decodeDelimited,
    lookupType,
    lookupEnum,
    parse,
  };
});

const systemState = vi.hoisted(() => ({
  info: { manufacturer: 'ACME', model: 'RemoteModel' },
  system: vi.fn(() => Promise.resolve(systemState.info)),
}));

const fsState = vi.hoisted(() => ({
  readFileSync: vi.fn(() => 'remote-proto'),
}));

const pathState = vi.hoisted(() => ({
  dirname: vi.fn(() => '/remote'),
  join: vi.fn((dir: string, file: string) => `${dir}/${file}`),
}));

const urlState = vi.hoisted(() => ({
  fileURLToPath: vi.fn(() => '/remote/RemoteMessageManager.js'),
}));

vi.mock('protobufjs', () => ({
  default: {
    parse: protoState.parse,
  },
}));

vi.mock('systeminformation', () => ({
  system: systemState.system,
}));

vi.mock('node:fs', () => fsState);
vi.mock('node:path', () => pathState);
vi.mock('node:url', () => urlState);

const loadManager = async () => {
  const mod = await import('~/lib/androidtv-remote/remote/RemoteMessageManager.js');
  const promise = systemState.system.mock.results.at(-1)?.value;
  if (promise) {
    await promise;
  }
  return mod.remoteMessageManager;
};

describe('RemoteMessageManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('~/lib/androidtv-remote/remote/remotemessage.proto', () => ({
      default: 'remote-proto',
    }));
    protoState.parse.mockClear();
    protoState.verify.mockClear();
    protoState.create.mockClear();
    protoState.encodeFinish.mockClear();
    protoState.encodeDelimited.mockClear();
    protoState.decodeDelimited.mockClear();
    protoState.lookupType.mockClear();
    protoState.lookupEnum.mockClear();
    systemState.system.mockClear();
    fsState.readFileSync.mockClear();
    pathState.dirname.mockClear();
    pathState.join.mockClear();
    urlState.fileURLToPath.mockClear();
  });

  it('parses definitions and stores system information', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const manager = await loadManager();

    expect(fsState.readFileSync).not.toHaveBeenCalled();
    expect(protoState.parse).toHaveBeenCalledWith('remote-proto');
    expect(systemState.system).toHaveBeenCalledTimes(1);
    expect(manager.manufacturer).toBe('ACME');
    expect(manager.model).toBe('RemoteModel');
    debugSpy.mockRestore();
  });

  it('creates remote configure message with resolved manufacturer/model', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const manager = await loadManager();

    const payload = manager.createRemoteConfigure(622, 'Model', 'Vendor', 1, '1');

    expect(protoState.verify).toHaveBeenCalledWith({
      remoteConfigure: {
        code1: 622,
        deviceInfo: {
          model: 'RemoteModel',
          vendor: 'ACME',
          unknown1: 1,
          unknown2: '1',
          packageName: 'androitv-remote',
          appVersion: '1.0.0',
        },
      },
    });
    expect(protoState.create).toHaveBeenCalledTimes(1);
    expect(protoState.encodeFinish).toHaveBeenCalledTimes(1);
    expect(payload).toEqual(Uint8Array.from([1, 2, 3]));
    debugSpy.mockRestore();
  });

  it('throws when payload verification fails', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const manager = await loadManager();
    protoState.verify.mockReturnValueOnce('invalid payload');

    expect(() => manager.create({} as never)).toThrow('invalid payload');
    debugSpy.mockRestore();
  });

  it('creates remote set active message', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const manager = await loadManager();

    manager.createRemoteSetActive(true);

    expect(protoState.verify).toHaveBeenCalledWith({
      remoteSetActive: {
        active: true,
      },
    });
    debugSpy.mockRestore();
  });

  it('suppresses debug logs for ping responses', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const manager = await loadManager();

    manager.createRemotePingResponse(42);

    expect(protoState.verify).toHaveBeenCalledWith({
      remotePingResponse: {
        val1: 42,
      },
    });
    expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Create Remote'));
    debugSpy.mockRestore();
  });

  it('creates key inject and other message types', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const manager = await loadManager();

    manager.createRemoteKeyInject('SHORT', 'POWER');
    manager.createRemoteAdjustVolumeLevel(5);
    manager.createRemoteResetPreferredAudioDevice();
    manager.createRemoteImeKeyInject('pkg', 'status');
    manager.createRemoteRemoteAppLinkLaunchRequest('link');

    expect(protoState.verify).toHaveBeenCalledTimes(5);
    expect(debugSpy.mock.calls.some((call) => String(call[0]).includes('Create Remote '))).toBe(
      true
    );
    debugSpy.mockRestore();
  });

  it('parses buffers using protobuf decoder', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const manager = await loadManager();
    const buffer = Uint8Array.from([9, 9, 9]);

    const result = manager.parse(buffer);

    expect(protoState.decodeDelimited).toHaveBeenCalledWith(buffer);
    expect(result).toEqual({ decoded: buffer });
    debugSpy.mockRestore();
  });

  it('falls back to filesystem when proto import fails', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.resetModules();
    vi.doMock('~/lib/androidtv-remote/remote/remotemessage.proto', () => ({
      get default() {
        throw new TypeError('Unknown file extension');
      },
    }));

    const manager = await loadManager();

    expect(urlState.fileURLToPath).toHaveBeenCalledTimes(1);
    expect(pathState.dirname).toHaveBeenCalledTimes(1);
    expect(pathState.join).toHaveBeenCalledWith('/remote', 'remotemessage.proto');
    expect(fsState.readFileSync).toHaveBeenCalledWith('/remote/remotemessage.proto', 'utf8');
    expect(protoState.parse).toHaveBeenCalledWith('remote-proto');
    expect(manager.model).toBe('RemoteModel');
    debugSpy.mockRestore();
  });

  it('rethrows unexpected errors during proto import', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.resetModules();
    vi.doMock('~/lib/androidtv-remote/remote/remotemessage.proto', () => ({
      get default() {
        throw new Error('boom');
      },
    }));

    await expect(loadManager()).rejects.toThrow('boom');
    debugSpy.mockRestore();
  });
});
