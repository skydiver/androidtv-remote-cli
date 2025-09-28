import crypto from 'crypto';
import forge from 'node-forge';

export class CertificateGenerator {
  static generateFull(name, country, state, locality, organisation, OU) {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + crypto.randomBytes(19).toString('hex');
    cert.validity.notBefore = new Date();
    const date = new Date();
    date.setUTCFullYear(2099);
    cert.validity.notAfter = date;

    const attributes = [
      { name: 'commonName', value: name },
      { name: 'countryName', value: country },
      { shortName: 'ST', value: state },
      { name: 'localityName', value: locality },
      { name: 'organizationName', value: organisation },
      { shortName: 'OU', value: OU },
    ];
    cert.setSubject(attributes);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    return {
      cert: forge.pki.certificateToPem(cert),
      key: forge.pki.privateKeyToPem(keys.privateKey),
    };
  }
}
