import { NextResponse } from "next/server";

import {
  assignConsultationToMe,
  ConsultationGatewayError,
} from "../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const assignment = await assignConsultationToMe(id);
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
