import { randomUUID } from "node:crypto";

import {
  kakaoHomepageEntrySubmissionSchema,
  type ConsultationAttributionInput,
} from "@lawand/core";
import { NextResponse } from "next/server";

import {
  createRotatingClientKey,
  extractClientAddress,
} from "@/lib/intake-client-key";
import { KAKAO_CHANNEL_CHAT_URL } from "@/lib/contact-channels";

const gatewayUrl =
  process.env.LAWAND_GATEWAY_URL ?? "http://127.0.0.1:3022";

function trustedProxyHops(): number {
  const parsed = Number(process.env.LAWAND_TRUSTED_PROXY_HOPS ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 5 ? parsed : 0;
}

function parseAttribution(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) return undefined;
  try {
    return JSON.parse(value) as ConsultationAttributionInput;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const redirect = () =>
    NextResponse.redirect(KAKAO_CHANNEL_CHAT_URL, { status: 303 });

  try {
    const publicIntakeApiKey = process.env.LAWAND_PUBLIC_INTAKE_API_KEY;
    if (!publicIntakeApiKey) {
      console.error(
        JSON.stringify({
          event: "homepage_kakao_entry_failed",
          reason: "missing_public_intake_key",
          occurredAt: new Date().toISOString(),
        }),
      );
      return redirect();
    }

    const formData = await request.formData();
    const idempotencyValue = formData.get("idempotencyKey");
    const displayNameValue = formData.get("displayName");
    const residenceRegionValue = formData.get("residenceRegion");
    const parsed = kakaoHomepageEntrySubmissionSchema.safeParse({
      source: "homepage_kakao",
      idempotencyKey:
        typeof idempotencyValue === "string" && idempotencyValue
          ? idempotencyValue
          : randomUUID(),
      displayName:
        typeof displayNameValue === "string" ? displayNameValue : "",
      residenceRegion:
        typeof residenceRegionValue === "string" ? residenceRegionValue : "",
      attribution: parseAttribution(formData.get("attribution")),
    });
    if (!parsed.success) {
      console.warn(
        JSON.stringify({
          event: "homepage_kakao_entry_failed",
          reason: "invalid_submission",
          occurredAt: new Date().toISOString(),
        }),
      );
      return NextResponse.json(
        {
          error: "invalid_kakao_entry",
          message: "이름 또는 카카오톡 표시명과 거주 지역을 입력해 주세요.",
        },
        { status: 400 },
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
    const response = await fetch(
      `${gatewayUrl}/v1/kakao/homepage-entries`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(parsed.data),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) {
      console.warn(
        JSON.stringify({
          event: "homepage_kakao_entry_failed",
          reason: "gateway_rejected",
          status: response.status,
          occurredAt: new Date().toISOString(),
        }),
      );
    }
    await response.body?.cancel();
    return redirect();
  } catch {
    console.error(
      JSON.stringify({
        event: "homepage_kakao_entry_failed",
        reason: "gateway_unavailable",
        occurredAt: new Date().toISOString(),
      }),
    );
    return redirect();
  }
}
