import { describe, it, expect, beforeEach, vi } from 'vitest';

const protoState = vi.hoisted(() => {
  const enums = {
    'pairing.PairingMessage.Status': { STATUS_OK: 200 },
    RoleType: { ROLE_TYPE_INPUT: 1 },
    'pairing.PairingEncoding.EncodingType': { ENCODING_TYPE_HEXADECIMAL: 3 },
  };

  const verify = vi.fn(() => null);
  const create = vi.fn((payload) => payload);
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
  info: { manufacturer: 'ACME', model: 'Droid' },
  system: vi.fn(() => Promise.resolve(systemState.info)),
}));

const fsState = vi.hoisted(() => ({
  readFileSync: vi.fn(() => 'proto-definition'),
}));

const pathState = vi.hoisted(() => ({
  dirname: vi.fn(() => '/mock'),
  join: vi.fn((dir: string, file: string) => `${dir}/${file}`),
}));

const urlState = vi.hoisted(() => ({
  fileURLToPath: vi.fn(() => '/mock/PairingMessageManager.js'),
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
  const mod = await import('../src/lib/androidtv-remote/pairing/PairingMessageManager.js');
  const promise = systemState.system.mock.results.at(-1)?.value;
  if (promise) {
    await promise;
  }
  return mod.pairingMessageManager;
};

describe('PairingMessageManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../src/lib/androidtv-remote/pairing/pairingmessage.proto', () => ({
      default: 'proto-definition',
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

  it('initializes protobuf definitions and system info', async () => {
    const manager = await loadManager();

    expect(fsState.readFileSync).not.toHaveBeenCalled();
    expect(protoState.parse).toHaveBeenCalledWith('proto-definition');
    expect(systemState.system).toHaveBeenCalledTimes(1);
    expect(manager.manufacturer).toBe('ACME');
    expect(manager.model).toBe('Droid');
  });

  it('creates pairing request with model name', async () => {
    const manager = await loadManager();

    const result = manager.createPairingRequest('Service');

    expect(protoState.verify).toHaveBeenCalledWith({
      pairingRequest: {
        serviceName: 'Service',
        clientName: 'Droid',
      },
      status: protoState.enums['pairing.PairingMessage.Status'].STATUS_OK,
      protocolVersion: 2,
    });
    expect(protoState.create).toHaveBeenCalledWith({
      pairingRequest: {
        serviceName: 'Service',
        clientName: 'Droid',
      },
      status: protoState.enums['pairing.PairingMessage.Status'].STATUS_OK,
      protocolVersion: 2,
    });
    expect(protoState.encodeDelimited).toHaveBeenCalledWith({
      pairingRequest: {
        serviceName: 'Service',
        clientName: 'Droid',
      },
      status: protoState.enums['pairing.PairingMessage.Status'].STATUS_OK,
      protocolVersion: 2,
    });
    expect(protoState.encodeFinish).toHaveBeenCalled();
    expect(result).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('creates pairing option with preferred role', async () => {
    const manager = await loadManager();

    manager.createPairingOption();

    expect(protoState.create).toHaveBeenCalledWith({
      pairingOption: {
        preferredRole: protoState.enums.RoleType.ROLE_TYPE_INPUT,
        inputEncodings: [
          {
            type: protoState.enums['pairing.PairingEncoding.EncodingType'].ENCODING_TYPE_HEXADECIMAL,
            symbolLength: 6,
          },
        ],
      },
      status: protoState.enums['pairing.PairingMessage.Status'].STATUS_OK,
      protocolVersion: 2,
    });
  });

  it('creates pairing configuration for input role', async () => {
    const manager = await loadManager();

    manager.createPairingConfiguration();

    expect(protoState.create).toHaveBeenCalledWith({
      pairingConfiguration: {
        clientRole: protoState.enums.RoleType.ROLE_TYPE_INPUT,
        encoding: {
          type: protoState.enums['pairing.PairingEncoding.EncodingType'].ENCODING_TYPE_HEXADECIMAL,
          symbolLength: 6,
        },
      },
      status: protoState.enums['pairing.PairingMessage.Status'].STATUS_OK,
      protocolVersion: 2,
    });
  });

  it('creates pairing secret with provided bytes', async () => {
    const manager = await loadManager();
    const secret = Uint8Array.from([9, 9, 9]);

    manager.createPairingSecret(secret);

    expect(protoState.create).toHaveBeenCalledWith({
      pairingSecret: {
        secret,
      },
      status: protoState.enums['pairing.PairingMessage.Status'].STATUS_OK,
      protocolVersion: 2,
    });
  });

  it('parses buffer using protobuf decoder', async () => {
    const manager = await loadManager();
    const buffer = Uint8Array.from([7, 7, 7]);

    const parsed = manager.parse(buffer);

    expect(protoState.decodeDelimited).toHaveBeenCalledWith(buffer);
    expect(parsed).toEqual({ decoded: buffer });
  });

  it('falls back to filesystem when proto import fails', async () => {
    protoState.parse.mockClear();
    fsState.readFileSync.mockClear();
    vi.resetModules();
    vi.doMock('../src/lib/androidtv-remote/pairing/pairingmessage.proto', () => ({
      get default() {
        throw new TypeError('Unknown file extension');
      },
    }));

    const manager = await loadManager();

    expect(urlState.fileURLToPath).toHaveBeenCalledTimes(1);
    expect(pathState.dirname).toHaveBeenCalledTimes(1);
    expect(pathState.join).toHaveBeenCalledTimes(1);
    expect(fsState.readFileSync).toHaveBeenCalledWith('/mock/pairingmessage.proto', 'utf8');
    expect(protoState.parse).toHaveBeenCalledWith('proto-definition');
    expect(systemState.system).toHaveBeenCalledTimes(1);
    expect(manager.model).toBe('Droid');
  });

  it('rethrows unexpected proto import errors', async () => {
    protoState.parse.mockClear();
    fsState.readFileSync.mockClear();
    vi.resetModules();
    vi.doMock('../src/lib/androidtv-remote/pairing/pairingmessage.proto', () => ({
      get default() {
        throw new Error('boom');
      },
    }));

    await expect(loadManager()).rejects.toThrow('boom');
    expect(fsState.readFileSync).not.toHaveBeenCalled();
    expect(protoState.parse).not.toHaveBeenCalled();
  });

  it('throws when message verification fails', async () => {
    const manager = await loadManager();
    protoState.verify.mockReturnValueOnce('invalid payload');

    expect(() => manager.create({})).toThrow('invalid payload');
  });
});
