import { NextResponse } from "next/server";

import { legalFriendsDirectoryMessageSendSchema } from "@lawand/core";

import {
  ConsultationGatewayError,
  requestDirectoryMessage,
} from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = legalFriendsDirectoryMessageSendSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message:
          parsed.error.issues[0]?.message ??
          "고객과 문자 내용을 다시 확인해 주세요.",
      },
      { status: 400 },
    );
  }
  try {
    const message = await requestDirectoryMessage(parsed.data);
    return NextResponse.json(message, {
      status: message.replayed ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "message_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "message_unavailable",
        message: "문자 발송을 요청하지 못했습니다.",
      },
      { status: 502 },
    );
  }
}
