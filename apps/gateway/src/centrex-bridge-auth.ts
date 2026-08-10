import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

export const CENTREX_BRIDGE_EVENT_PATH = "/v1/centrex-bridge/events";
export const CENTREX_BRIDGE_COMMAND_NEXT_PATH =
  "/v1/centrex-bridge/commands/next";
export const CENTREX_BRIDGE_COMMAND_RESULT_PREFIX =
  "/v1/centrex-bridge/commands/";
export const CENTREX_BRIDGE_CLOCK_SKEW_SECONDS = 300;

export type CentrexBridgeKeyMap = Readonly<
  Record<
    string,
    { endpointId: string; secret: Buffer; staffUserId?: string }
  >
>;

export class CentrexBridgeAuthenticationError extends Error {
  constructor(
    readonly code:
      | "missing_authentication"
      | "unknown_bridge"
      | "invalid_timestamp"
      | "stale_request"
      | "invalid_nonce"
      | "invalid_signature",
  ) {
    super(code);
  }
}

function singleHeader(
  headers: IncomingHttpHeaders,
  name: string,
): string | null {
  const value = headers[name];
  return typeof value === "string" ? value : null;
}

function sha256(value: Buffer | string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function centrexBridgeCanonicalRequest(input: {
  bridgeId: string;
  timestamp: string;
  nonce: string;
  body: Buffer;
  method?: "GET" | "POST";
  path?: string;
}): string {
  return [
    "v1",
    input.method ?? "POST",
    input.path ?? CENTREX_BRIDGE_EVENT_PATH,
    input.bridgeId,
    input.timestamp,
    input.nonce,
    sha256(input.body).toString("hex"),
  ].join("\n");
}

export function verifyCentrexBridgeRequest(input: {
  headers: IncomingHttpHeaders;
  body: Buffer;
  keys: CentrexBridgeKeyMap;
  now?: Date;
  method?: "GET" | "POST";
  path?: string;
}) {
  const bridgeId = singleHeader(input.headers, "x-lawand-bridge-id");
  const timestamp = singleHeader(input.headers, "x-lawand-bridge-timestamp");
  const nonce = singleHeader(input.headers, "x-lawand-bridge-nonce");
  const signature = singleHeader(input.headers, "x-lawand-bridge-signature");
  if (!bridgeId || !timestamp || !nonce || !signature) {
    throw new CentrexBridgeAuthenticationError("missing_authentication");
  }

  const key = input.keys[bridgeId];
  if (!key) {
    throw new CentrexBridgeAuthenticationError("unknown_bridge");
  }
  if (!/^[0-9]{10}$/.test(timestamp)) {
    throw new CentrexBridgeAuthenticationError("invalid_timestamp");
  }
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) >
      CENTREX_BRIDGE_CLOCK_SKEW_SECONDS
  ) {
    throw new CentrexBridgeAuthenticationError("stale_request");
  }
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(nonce)) {
    throw new CentrexBridgeAuthenticationError("invalid_nonce");
  }
  const match = /^v1=([0-9a-f]{64})$/.exec(signature);
  if (!match?.[1]) {
    throw new CentrexBridgeAuthenticationError("invalid_signature");
  }

  const canonical = centrexBridgeCanonicalRequest({
    bridgeId,
    timestamp,
    nonce,
    body: input.body,
    ...(input.method ? { method: input.method } : {}),
    ...(input.path ? { path: input.path } : {}),
  });
  const expected = createHmac("sha256", key.secret)
    .update(canonical, "utf8")
    .digest();
  const provided = Buffer.from(match[1], "hex");
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new CentrexBridgeAuthenticationError("invalid_signature");
  }

  return {
    bridgeId,
    endpointId: key.endpointId,
    authenticationNonceHash: sha256(nonce),
  };
}
