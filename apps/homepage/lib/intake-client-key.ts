import { createHmac } from "node:crypto";
import { isIP } from "node:net";

function normalizeAddress(value: string): string | null {
  let candidate = value.trim();
  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }
  if (candidate.startsWith("::ffff:")) {
    const mapped = candidate.slice("::ffff:".length);
    if (isIP(mapped) === 4) return mapped;
  }
  return isIP(candidate) === 0 ? null : candidate.toLowerCase();
}

export function extractClientAddress(
  headers: Headers,
  trustedProxyHops: number,
): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const addresses = forwarded
      .split(",")
      .map(normalizeAddress)
      .filter((address): address is string => address !== null);
    const selected = addresses.at(-(trustedProxyHops + 1));
    if (selected) return selected;
  }

  return normalizeAddress(headers.get("x-real-ip") ?? "");
}

export function createRotatingClientKey(input: {
  address: string;
  secret: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const utcDay = now.toISOString().slice(0, 10);
  return createHmac("sha256", input.secret)
    .update(`public-intake-network-v1\0${utcDay}\0${input.address}`)
    .digest("base64url");
}
