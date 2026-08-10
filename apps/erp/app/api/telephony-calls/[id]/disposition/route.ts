import { NextResponse } from "next/server";

import {
  confirmTelephonyCallDisposition,
  ConsultationGatewayError,
  type TelephonyCallDisposition,
} from "../../../../../lib/gateway";

export const dynamic = "force-dynamic";

const dispositions = new Set<TelephonyCallDisposition>([
  "customer_conversation",
  "voicemail",
  "no_answer",
  "rejected",
  "busy",
  "caller_cancelled",
  "callback_required",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    disposition?: unknown;
  } | null;
  if (
    !body ||
    typeof body.disposition !== "string" ||
    !dispositions.has(body.disposition as TelephonyCallDisposition)
  ) {
    return NextResponse.json(
      { error: "invalid_disposition", message: "통화 결과를 선택해 주세요." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await confirmTelephonyCallDisposition(
        id,
        body.disposition as TelephonyCallDisposition,
      ),
    );
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "disposition_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "disposition_unavailable",
        message: "통화 결과를 저장하지 못했습니다.",
      },
      { status: 502 },
    );
  }
}
