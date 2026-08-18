import { NextResponse } from "next/server";
import { getReviewGiftCoupon, sendReviewGiftCoupon } from "../../../../../../lib/gateway";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ recordType: string; id: string }> }) {
  const { recordType, id } = await context.params;
  if (recordType !== "review" && recordType !== "submission") return NextResponse.json({ message: "후기 식별자가 올바르지 않습니다." }, { status: 400 });
  try {
    return NextResponse.json(await getReviewGiftCoupon(recordType, id));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "쿠폰 발송 내역을 불러오지 못했습니다." }, { status: 502 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ recordType: string; id: string }> }) {
  const { recordType, id } = await context.params;
  if (recordType !== "review" && recordType !== "submission") return NextResponse.json({ message: "후기 식별자가 올바르지 않습니다." }, { status: 400 });
  const body = await request.json().catch(() => null) as Parameters<typeof sendReviewGiftCoupon>[2] | null;
  try {
    return NextResponse.json(await sendReviewGiftCoupon(recordType, id, body as Parameters<typeof sendReviewGiftCoupon>[2]));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "쿠폰 발송에 실패했습니다." }, { status: 409 });
  }
}
