import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const forgeMocks = vi.hoisted(() => {
  const certificate = {
    publicKey: undefined as unknown,
    serialNumber: undefined as string | undefined,
    validity: {
      notBefore: undefined as Date | undefined,
      notAfter: undefined as Date | undefined,
    },
    setSubject: vi.fn(),
    sign: vi.fn(),
  };

  const keyPair = {
    publicKey: 'public-key',
    privateKey: 'private-key',
  };

  const sha256Instance = { digest: vi.fn() };

  return {
    certificate,
    keyPair,
    sha256Instance,
    api: {
      pki: {
        rsa: {
          generateKeyPair: vi.fn(() => keyPair),
        },
        createCertificate: vi.fn(() => certificate),
        certificateToPem: vi.fn(() => 'PEM_CERT'),
        privateKeyToPem: vi.fn(() => 'PEM_KEY'),
      },
      md: {
        sha256: {
          create: vi.fn(() => sha256Instance),
        },
      },
    },
  };
});

vi.mock('node-forge', () => ({
  default: forgeMocks.api,
}));

describe('CertificateGenerator', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    forgeMocks.certificate.publicKey = undefined;
    forgeMocks.certificate.serialNumber = undefined;
    forgeMocks.certificate.validity.notBefore = undefined;
    forgeMocks.certificate.validity.notAfter = undefined;
    forgeMocks.certificate.setSubject.mockClear();
    forgeMocks.certificate.sign.mockClear();
    forgeMocks.api.pki.rsa.generateKeyPair.mockClear();
    forgeMocks.api.pki.createCertificate.mockClear();
    forgeMocks.api.pki.certificateToPem.mockClear();
    forgeMocks.api.pki.privateKeyToPem.mockClear();
    forgeMocks.api.md.sha256.create.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates a certificate with expected metadata', async () => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    vi.setSystemTime(now);
    const randomBuffer = Buffer.from('0102030405060708090a0b0c0d0e0f10111213', 'hex').subarray(
      0,
      19
    );
    const randomBytesSpy = vi.spyOn(crypto, 'randomBytes').mockReturnValue(randomBuffer);

    const { CertificateGenerator } = await import(
      '~/lib/androidtv-remote/certificate/CertificateGenerator.js'
    );

    const result = CertificateGenerator.generateFull(
      'Service',
      'US',
      'CA',
      'San Francisco',
      'Org',
      'Unit'
    );

    expect(forgeMocks.api.pki.rsa.generateKeyPair).toHaveBeenCalledWith(2048);
    expect(forgeMocks.api.pki.createCertificate).toHaveBeenCalled();
    expect(forgeMocks.certificate.publicKey).toBe(forgeMocks.keyPair.publicKey);
    expect(randomBytesSpy).toHaveBeenCalledWith(19);
    expect(forgeMocks.certificate.serialNumber).toBe('01' + randomBuffer.toString('hex'));
    expect(forgeMocks.certificate.validity.notBefore).toEqual(now);
    expect(forgeMocks.certificate.validity.notAfter?.getUTCFullYear()).toBe(2099);
    expect(forgeMocks.certificate.setSubject).toHaveBeenCalledWith([
      { name: 'commonName', value: 'Service' },
      { name: 'countryName', value: 'US' },
      { shortName: 'ST', value: 'CA' },
      { name: 'localityName', value: 'San Francisco' },
      { name: 'organizationName', value: 'Org' },
      { shortName: 'OU', value: 'Unit' },
    ]);
    expect(forgeMocks.api.md.sha256.create).toHaveBeenCalled();
    expect(forgeMocks.certificate.sign).toHaveBeenCalledWith(
      forgeMocks.keyPair.privateKey,
      forgeMocks.sha256Instance
    );
    expect(result).toEqual({ cert: 'PEM_CERT', key: 'PEM_KEY' });
    expect(forgeMocks.api.pki.certificateToPem).toHaveBeenCalledWith(forgeMocks.certificate);
    expect(forgeMocks.api.pki.privateKeyToPem).toHaveBeenCalledWith(forgeMocks.keyPair.privateKey);
  });
});
