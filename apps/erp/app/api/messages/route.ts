import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  getMessageHub,
} from "../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const cursor = searchParams.get("cursor")?.trim() || undefined;
  const limit = Number(searchParams.get("limit") ?? "50");
  try {
    return NextResponse.json(
      await getMessageHub({
        ...(cursor ? { cursor } : {}),
        ...(Number.isFinite(limit) ? { limit } : {}),
      }),
    );
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "message_hub_unavailable", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "message_hub_unavailable",
        message: "문자 내역을 불러오지 못했습니다.",
      },
      { status: 502 },
    );
  }
}
