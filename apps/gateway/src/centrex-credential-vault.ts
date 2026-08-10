import { eq } from "drizzle-orm";

import { telephonyEndpointCredentials } from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const SHA512_HEX = /^[0-9a-f]{128}$/;

function credentialContext(endpointId: string): string {
  return `telephony_endpoint_credentials.password_sha512:${endpointId}`;
}

export function encryptCentrexCredential(
  protection: DataProtection,
  endpointId: string,
  passwordSha512: string,
) {
  const normalized = passwordSha512.toLowerCase();
  if (!SHA512_HEX.test(normalized)) {
    throw new Error("invalid_centrex_password_sha512");
  }
  return protection.encrypt(normalized, credentialContext(endpointId));
}

export function decryptCentrexCredential(
  protection: DataProtection,
  input: {
    endpointId: string;
    ciphertext: Buffer;
    nonce: Buffer;
    keyVersion: string;
  },
): string {
  const value = protection.decrypt(
    {
      ciphertext: input.ciphertext,
      nonce: input.nonce,
      keyVersion: input.keyVersion,
    },
    credentialContext(input.endpointId),
  );
  if (!SHA512_HEX.test(value)) {
    throw new Error("invalid_stored_centrex_password_sha512");
  }
  return value;
}

export function createCentrexCredentialVault(options: {
  db: Database;
  protection: DataProtection;
  fallbackCredentials?: Readonly<Record<string, string>>;
}) {
  const { db, protection } = options;
  const fallbackCredentials = options.fallbackCredentials ?? {};

  async function get(input: {
    endpointId: string;
    credentialKey: string;
  }): Promise<string | null> {
    const [stored] = await db
      .select({
        ciphertext:
          telephonyEndpointCredentials.passwordSha512Ciphertext,
        nonce: telephonyEndpointCredentials.passwordSha512Nonce,
        keyVersion:
          telephonyEndpointCredentials.passwordSha512KeyVersion,
      })
      .from(telephonyEndpointCredentials)
      .where(eq(telephonyEndpointCredentials.endpointId, input.endpointId))
      .limit(1);
    if (stored) {
      return decryptCentrexCredential(protection, {
        endpointId: input.endpointId,
        ciphertext: stored.ciphertext,
        nonce: stored.nonce,
        keyVersion: stored.keyVersion,
      });
    }
    return fallbackCredentials[input.credentialKey]?.toLowerCase() ?? null;
  }

  async function configuredEndpointIds(): Promise<ReadonlySet<string>> {
    const rows = await db
      .select({ endpointId: telephonyEndpointCredentials.endpointId })
      .from(telephonyEndpointCredentials);
    return new Set(rows.map(({ endpointId }) => endpointId));
  }

  function hasFallback(credentialKey: string): boolean {
    return Boolean(fallbackCredentials[credentialKey]);
  }

  return { configuredEndpointIds, get, hasFallback };
}

export type CentrexCredentialVault = ReturnType<
  typeof createCentrexCredentialVault
>;
