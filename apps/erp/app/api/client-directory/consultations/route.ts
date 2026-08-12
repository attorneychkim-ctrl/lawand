import { NextResponse } from "next/server";

import { legalFriendsDirectoryConsultationCreateSchema } from "@lawand/core";

import {
  ConsultationGatewayError,
  createClientDirectoryConsultation,
} from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = legalFriendsDirectoryConsultationCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message:
          parsed.error.issues[0]?.message ??
          "신건상담 고객정보를 다시 확인해 주세요.",
      },
      { status: 400 },
    );
  }
  try {
    const result = await createClientDirectoryConsultation(parsed.data);
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "consultation_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "consultation_unavailable",
        message: "신건상담을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 502 },
    );
  }
}
