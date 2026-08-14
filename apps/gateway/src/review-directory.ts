import { and, eq, inArray, sql } from "drizzle-orm";

import { createEventId } from "@lawand/core";
import {
  customerReviewLinkManagers,
  staffExternalAccounts,
  staffUsers,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

type Database = ReturnType<typeof createDatabaseClient>["db"];
type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export type ReviewDirectoryTarget = {
  clientIdx: number;
  caseIdx: number;
  clientName: string;
  phone: string | null;
  livingPlace: string | null;
  caseType: number;
  caseCategory: number;
  caseState: number;
  maxState: number;
  isClosed: boolean;
  isRepealed: boolean;
  courtName: string | null;
  caseNumber: string | null;
  caseName: string | null;
  staff: Array<{
    name: string;
    externalMemberIdx: number;
    position: 1 | 2 | 3;
  }>;
  caseCreatedOn: string;
  caseUpdatedOn: string;
};

type ReviewDirectoryTargetRow = {
  client_idx: number;
  case_idx: number;
  client_name: string;
  phone: string | null;
  living_place: string | null;
  case_type: number;
  case_category: number;
  case_state: number;
  max_state: number;
  is_closed: number | null;
  is_repealed: number | null;
  court_name: string | null;
  case_number: string | null;
  case_name: string | null;
  primary_staff_name: string | null;
  secondary_staff_name: string | null;
  tertiary_staff_name: string | null;
  primary_member_idx: number | null;
  secondary_member_idx: number | null;
  tertiary_member_idx: number | null;
  case_created_on: string;
  case_updated_on: string;
};

type ExactPhoneTargetRow = {
  client_idx: number;
  case_idx: number;
};

function toTarget(row: ReviewDirectoryTargetRow): ReviewDirectoryTarget {
  const staffEntries = [
    [row.primary_staff_name, row.primary_member_idx, 1],
    [row.secondary_staff_name, row.secondary_member_idx, 2],
    [row.tertiary_staff_name, row.tertiary_member_idx, 3],
  ] as const;
  const staff: ReviewDirectoryTarget["staff"] = [];
  for (const [name, externalMemberIdx, position] of staffEntries) {
    if (
      !name ||
      !externalMemberIdx ||
      staff.some((item) => item.externalMemberIdx === externalMemberIdx)
    ) {
      continue;
    }
    staff.push({ name, externalMemberIdx, position });
  }
  return {
    clientIdx: row.client_idx,
    caseIdx: row.case_idx,
    clientName: row.client_name,
    phone: row.phone,
    livingPlace: row.living_place,
    caseType: row.case_type,
    caseCategory: row.case_category,
    caseState: row.case_state,
    maxState: row.max_state,
    isClosed: row.is_closed === 1,
    isRepealed: row.is_repealed === 1,
    courtName: row.court_name,
    caseNumber: row.case_number,
    caseName: row.case_name,
    staff,
    caseCreatedOn: row.case_created_on,
    caseUpdatedOn: row.case_updated_on,
  };
}

export async function resolveReviewDirectoryTarget(
  executor: Pick<DatabaseTransaction, "execute">,
  clientIdx: number,
  caseIdx: number,
): Promise<ReviewDirectoryTarget | null> {
  const result = await executor.execute(
    sql<ReviewDirectoryTargetRow>`SELECT * FROM public.resolve_review_directory_target(${clientIdx}, ${caseIdx})`,
  );
  const row = (result.rows as ReviewDirectoryTargetRow[])[0];
  return row ? toTarget(row) : null;
}

export async function resolveExactPhoneReviewDirectoryTarget(
  tx: DatabaseTransaction,
  phone: string,
): Promise<ReviewDirectoryTarget | null> {
  const result = await tx.execute(
    sql<ExactPhoneTargetRow>`SELECT client_idx, case_idx FROM public.resolve_inbound_phone_directory(${phone})`,
  );
  const rows = result.rows as ExactPhoneTargetRow[];
  if (rows.length !== 1) return null;
  const row = rows[0];
  return row
    ? resolveReviewDirectoryTarget(tx, row.client_idx, row.case_idx)
    : null;
}

export async function replaceReviewLinkManagers(
  tx: DatabaseTransaction,
  linkId: string,
  target: ReviewDirectoryTarget,
) {
  await tx
    .delete(customerReviewLinkManagers)
    .where(eq(customerReviewLinkManagers.linkId, linkId));
  const memberIndexes = target.staff.map((staff) => staff.externalMemberIdx);
  if (memberIndexes.length === 0) return [];
  const linkedStaff = await tx
    .select({
      externalMemberIdx: staffExternalAccounts.externalMemberIdx,
      staffUserId: staffExternalAccounts.staffUserId,
    })
    .from(staffExternalAccounts)
    .innerJoin(
      staffUsers,
      and(
        eq(staffUsers.id, staffExternalAccounts.staffUserId),
        eq(staffUsers.status, "active"),
      ),
    )
    .where(
      and(
        eq(staffExternalAccounts.provider, "legalfriends"),
        eq(staffExternalAccounts.isActive, true),
        inArray(staffExternalAccounts.externalMemberIdx, memberIndexes),
      ),
    );
  const staffUserByMember = new Map(
    linkedStaff.flatMap((item) =>
      item.externalMemberIdx === null
        ? []
        : [[item.externalMemberIdx, item.staffUserId] as const],
    ),
  );
  const valuesByUserId = new Map<
    string,
    {
      id: string;
      linkId: string;
      staffUserId: string;
      externalMemberIdx: number;
      position: number;
    }
  >();
  for (const staff of target.staff) {
    const staffUserId = staffUserByMember.get(staff.externalMemberIdx);
    if (!staffUserId || valuesByUserId.has(staffUserId)) continue;
    valuesByUserId.set(staffUserId, {
      id: createEventId(),
      linkId,
      staffUserId,
      externalMemberIdx: staff.externalMemberIdx,
      position: staff.position,
    });
  }
  const values = [...valuesByUserId.values()];
  if (values.length > 0) {
    await tx.insert(customerReviewLinkManagers).values(values);
  }
  return values;
}
