import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  getTelephonyMessage,
} from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await getTelephonyMessage(id));
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "message_lookup_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "message_lookup_unavailable", message: "문자 상태를 확인하지 못했습니다." },
      { status: 502 },
    );
  }
}
