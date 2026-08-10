import { NextResponse } from "next/server";

import { getConsultations } from "../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ items: await getConsultations() });
  } catch {
    return NextResponse.json(
      { error: "consultation_list_unavailable" },
      { status: 502 },
    );
  }
}
