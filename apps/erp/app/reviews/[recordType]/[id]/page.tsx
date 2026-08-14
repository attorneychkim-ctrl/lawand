import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getReviewDetail, type ReviewRecordType } from "../../../../lib/gateway";
import { requireStaff } from "../../../../lib/session";
import { ReviewDetailWorkspace } from "../../../_components/review-detail-workspace";
import { StaffBar } from "../../../_components/staff-bar";

export const metadata: Metadata = {
  title: "후기 상세 | 로앤 ERP",
};

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ recordType: string; id: string }>;
}) {
  const staff = await requireStaff();
  const { recordType, id } = await params;
  if (recordType !== "review" && recordType !== "submission") notFound();
  const detail = await getReviewDetail(recordType as ReviewRecordType, id);
  if (!detail) notFound();
  return (
    <>
      <StaffBar staff={staff} />
      <ReviewDetailWorkspace detail={detail} staffName={staff.displayName} />
    </>
  );
}
