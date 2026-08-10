import { NextResponse } from "next/server";

import { telephonyMessageSendSchema } from "@lawand/core";

import {
  ConsultationGatewayError,
  requestConsultationMessage,
} from "../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parsed = telephonyMessageSendSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message ?? "문자 내용을 확인해 주세요." },
      { status: 400 },
    );
  }
  const { id } = await context.params;
  try {
    const message = await requestConsultationMessage(id, parsed.data);
    return NextResponse.json(message, { status: message.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "message_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "message_unavailable", message: "문자 발송을 요청하지 못했습니다." },
      { status: 502 },
    );
  }
}
