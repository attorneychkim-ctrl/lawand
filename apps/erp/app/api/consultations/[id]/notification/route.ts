import { NextResponse } from "next/server";

import { getConsultation } from "../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const consultation = await getConsultation(id);
    if (!consultation) {
      return NextResponse.json(
        { error: "consultation_not_found" },
        { status: 404 },
      );
    }
    const latestRequest = consultation.requests[0];
    const residenceRegion = latestRequest?.intake.residenceRegion;
    return NextResponse.json({
      id: consultation.id,
      publicReceiptCode: consultation.publicReceiptCode,
      displayName: latestRequest?.name ?? consultation.displayName,
      contactChannel: consultation.contactChannel,
      phone: latestRequest?.phone ?? null,
      residenceRegion:
        typeof residenceRegion === "string" ? residenceRegion : null,
      canClaim:
        consultation.state === "requested" &&
        (consultation.kakaoEntry?.status !== "pending" ||
          consultation.kakaoEntry.nameProvided),
    });
  } catch {
    return NextResponse.json(
      { error: "consultation_notification_unavailable" },
      { status: 502 },
    );
  }
}
