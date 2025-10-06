import protobufjs from 'protobufjs';
import { system } from 'systeminformation';

let pairingMessageDefinition: string;

try {
  pairingMessageDefinition = (await import('./pairingmessage.proto')).default;
} catch (error) {
  if (error instanceof TypeError && String(error).includes('Unknown file extension')) {
    const [{ readFileSync }, { dirname, join }, { fileURLToPath }] = await Promise.all([
      import('node:fs'),
      import('node:path'),
      import('node:url'),
    ]);
    const directory = dirname(fileURLToPath(import.meta.url));
    pairingMessageDefinition = readFileSync(join(directory, 'pairingmessage.proto'), 'utf8');
  } else {
    throw error;
  }
}

class PairingMessageManager {
  constructor() {
    this.root = protobufjs.parse(pairingMessageDefinition).root;

    this.PairingMessage = this.root.lookupType('pairing.PairingMessage');
    this.Status = this.root.lookupEnum('pairing.PairingMessage.Status').values;
    this.RoleType = this.root.lookupEnum('RoleType').values;
    this.EncodingType = this.root.lookupEnum('pairing.PairingEncoding.EncodingType').values;

    system().then((data) => {
      pairingMessageManager.manufacturer = data.manufacturer;
      pairingMessageManager.model = data.model;
    });
  }

  create(payload) {
    let errMsg = this.PairingMessage.verify(payload);
    if (errMsg) throw Error(errMsg);

    let message = this.PairingMessage.create(payload);

    return this.PairingMessage.encodeDelimited(message).finish();
  }

  createPairingRequest(service_name) {
    return this.create({
      pairingRequest: {
        serviceName: service_name,
        clientName: this.model,
      },
      status: this.Status.STATUS_OK,
      protocolVersion: 2,
    });
  }

  createPairingOption() {
    return this.create({
      pairingOption: {
        preferredRole: this.RoleType.ROLE_TYPE_INPUT,
        inputEncodings: [
          {
            type: this.EncodingType.ENCODING_TYPE_HEXADECIMAL,
            symbolLength: 6,
          },
        ],
      },
      status: this.Status.STATUS_OK,
      protocolVersion: 2,
    });
  }

  createPairingConfiguration() {
    return this.create({
      pairingConfiguration: {
        clientRole: this.RoleType.ROLE_TYPE_INPUT,
        encoding: {
          type: this.EncodingType.ENCODING_TYPE_HEXADECIMAL,
          symbolLength: 6,
        },
      },
      status: this.Status.STATUS_OK,
      protocolVersion: 2,
    });
  }

  createPairingSecret(secret) {
    return this.create({
      pairingSecret: {
        secret: secret,
      },
      status: this.Status.STATUS_OK,
      protocolVersion: 2,
    });
  }

  parse(buffer) {
    return this.PairingMessage.decodeDelimited(buffer);
  }
}
let pairingMessageManager = new PairingMessageManager();
export { pairingMessageManager };
