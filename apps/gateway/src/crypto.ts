import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

export type EncryptedValue = {
  ciphertext: Buffer;
  nonce: Buffer;
  keyVersion: string;
};

function decodeKey(value: string, name: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(`${name}는 base64 인코딩된 32바이트 키여야 합니다.`);
  }
  return key;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(",")}}`;
}

export function createDataProtection(config: {
  encryptionKey: string;
  hmacKey: string;
  keyVersion: string;
}) {
  const encryptionKey = decodeKey(
    config.encryptionKey,
    "LAWAND_DATA_ENCRYPTION_KEY_V1",
  );
  const hmacKey = decodeKey(config.hmacKey, "LAWAND_DATA_HMAC_KEY_V1");

  function encrypt(value: string, context: string): EncryptedValue {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return {
      ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]),
      nonce,
      keyVersion: config.keyVersion,
    };
  }

  function decrypt(value: EncryptedValue, context: string): string {
    if (value.keyVersion !== config.keyVersion) {
      throw new Error(`지원하지 않는 데이터 키 버전: ${value.keyVersion}`);
    }
    if (value.ciphertext.length < 16) {
      throw new Error("암호문이 올바르지 않습니다.");
    }

    const tagOffset = value.ciphertext.length - 16;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, value.nonce);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(value.ciphertext.subarray(tagOffset));
    return Buffer.concat([
      decipher.update(value.ciphertext.subarray(0, tagOffset)),
      decipher.final(),
    ]).toString("utf8");
  }

  function fingerprint(value: unknown): Buffer {
    return createHmac("sha256", hmacKey)
      .update(canonicalize(value))
      .digest();
  }

  function advisoryLockKey(fingerprintValue: Buffer): string {
    return fingerprintValue.readBigInt64BE(0).toString();
  }

  return {
    advisoryLockKey,
    decrypt,
    encrypt,
    fingerprint,
  };
}

export type DataProtection = ReturnType<typeof createDataProtection>;
