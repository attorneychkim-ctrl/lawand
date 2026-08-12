import { NextResponse } from "next/server";

import {
  assignConsultationToMe,
  ConsultationGatewayError,
} from "../../../../../lib/gateway";
import { legalFriendsConsultationHandlingSchema } from "@lawand/core";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const handling = body.legalFriendsHandling
      ? legalFriendsConsultationHandlingSchema.safeParse(
          body.legalFriendsHandling,
        )
      : null;
    if (handling && !handling.success) {
      return NextResponse.json(
        {
          error: "legalfriends_handling_invalid",
          message: "리걸프렌즈 처리 구분을 다시 선택해 주세요.",
        },
        { status: 400 },
      );
    }
    const assignment = await assignConsultationToMe(
      id,
      handling?.success ? handling.data : undefined,
    );
    return NextResponse.json(assignment, {
      status: assignment.replayed ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "consultation_assignment_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "consultation_assignment_unavailable",
        message: "상담을 배정하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 502 },
    );
  }
}
