import { NextResponse } from "next/server";

import { requireStaff } from "../../../lib/session";

export const dynamic = "force-dynamic";

const channels = new Set([
  "consultation",
  "telephony",
  "review",
  "service_worker",
]);
const stages = new Set(["sse", "prepare", "display"]);
const outcomes = new Set([
  "connected",
  "disconnected",
  "sync",
  "succeeded",
  "failed",
]);
const permissions = new Set(["default", "denied", "granted", "unsupported"]);
const visibilities = new Set(["hidden", "visible", "prerender"]);
const methods = new Set(["service_worker", "page"]);

export async function POST(request: Request) {
  await requireStaff();
  const value = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (
    !value ||
    !channels.has(String(value.channel)) ||
    !stages.has(String(value.stage)) ||
    !outcomes.has(String(value.outcome)) ||
    !permissions.has(String(value.permission)) ||
    !visibilities.has(String(value.visibility)) ||
    typeof value.online !== "boolean" ||
    (value.displayMethod !== undefined &&
      !methods.has(String(value.displayMethod))) ||
    (value.reason !== undefined &&
      (typeof value.reason !== "string" || value.reason.length > 80))
  ) {
    return NextResponse.json({ error: "invalid_diagnostic" }, { status: 400 });
  }

  console.info("lawand browser notification diagnostic", {
    channel: value.channel,
    stage: value.stage,
    outcome: value.outcome,
    permission: value.permission,
    visibility: value.visibility,
    online: value.online,
    ...(value.displayMethod ? { displayMethod: value.displayMethod } : {}),
    ...(value.reason ? { reason: value.reason } : {}),
  });
  return new NextResponse(null, { status: 204 });
}
