import { NextResponse } from "next/server";

import {
  createRotatingClientKey,
  extractClientAddress,
} from "@/lib/intake-client-key";

const gatewayUrl =
  process.env.LAWAND_GATEWAY_URL ?? "http://127.0.0.1:3022";
const MAX_BODY_BYTES = 64 * 1024;

function trustedProxyHops(): number {
  const parsed = Number(process.env.LAWAND_TRUSTED_PROXY_HOPS ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 5 ? parsed : 0;
}

export async function POST(request: Request) {
  try {
    const publicIntakeApiKey = process.env.LAWAND_PUBLIC_INTAKE_API_KEY;
    if (!publicIntakeApiKey) {
      return NextResponse.json(
        {
          error: "service_unavailable",
          message: "상담 접수 서버 설정을 확인하고 있습니다.",
        },
        { status: 503 },
      );
    }

    if (!request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json(
        { error: "unsupported_media_type" },
        { status: 415 },
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "payload_too_large" },
        { status: 413 },
      );
    }

    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "payload_too_large" },
        { status: 413 },
      );
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-lawand-public-intake-key": publicIntakeApiKey,
    };
    const clientAddress = extractClientAddress(
      request.headers,
      trustedProxyHops(),
    );
    if (clientAddress) {
      headers["x-lawand-client-key"] = createRotatingClientKey({
        address: clientAddress,
        secret: publicIntakeApiKey,
      });
    }

    const response = await fetch(`${gatewayUrl}/v1/consultations`, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ??
          "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...(response.headers.get("retry-after")
          ? { "retry-after": response.headers.get("retry-after")! }
          : {}),
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "gateway_unavailable",
        message: "상담 접수 서버에 연결하지 못했습니다.",
      },
      { status: 503 },
    );
  }
}
