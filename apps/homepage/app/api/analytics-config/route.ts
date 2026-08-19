import { NextResponse } from "next/server";

import { normalizeGa4MeasurementId } from "@/lib/analytics-contract";

export const dynamic = "force-dynamic";

export function GET() {
  const measurementId = normalizeGa4MeasurementId(
    process.env.LAWAND_GA4_MEASUREMENT_ID,
  );
  return NextResponse.json(
    { measurementId },
    {
      headers: {
        "cache-control": "private, no-store, max-age=0",
      },
    },
  );
}
