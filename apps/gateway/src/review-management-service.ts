import {
  and,
  desc,
  eq,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  REVIEW_REQUEST_DEFAULT_TEMPLATES,
  centrexMessageByteLength,
  createEventId,
  maskReviewAuthorDisplay,
  renderReviewRequestTemplate,
  reviewCustomerLinkSchema,
  reviewModerationSchema,
  reviewReplyUpsertSchema,
  reviewRequestBatchSendSchema,
  reviewRequestTemplateCreateSchema,
  reviewRequestTemplateUpdateSchema,
  type ReviewCustomerLink,
  type ReviewModeration,
  type ReviewReplyUpsert,
  type ReviewProgressStage,
  type ReviewRequestBatchSend,
  type ReviewRequestTemplateCreate,
  type ReviewRequestTemplateUpdate,
  type ReviewRestrictionReason,
} from "@lawand/core";
import {
  customerReviewLinkManagers,
  customerReviewLinks,
  customerReviewReplies,
  customerReviewRequests,
  customerReviewRequestTemplates,
  customerReviews,
  customerReviewSubmissions,
  staffAuditLogs,
  staffProfiles,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { StaffPrincipal } from "./auth.js";
import type { DataProtection } from "./crypto.js";
import {
  replaceReviewLinkManagers,
  reviewPracticeAreaFromDirectoryCaseType,
  resolveReviewDirectoryTarget,
  type ReviewDirectoryTarget,
} from "./review-directory.js";
import { createReviewRequestToken } from "./review-token.js";
import type { TelephonyService } from "./telephony-service.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

export type ReviewRecordType = "review" | "submission";
export type ReviewListFilter =
  | "all"
  | "reply_needed"
  | "pending"
  | "published"
  | "restricted"
  | "mine";

export type ReviewManagementListItem = {
  id: string;
  recordType: ReviewRecordType;
  receiptCode: string | null;
  authorDisplay: string;
  contentPreview: string;
  practiceArea: "personal_rehabilitation" | "personal_bankruptcy" | "other";
  progressStage: "consultation" | "commencement" | "discharge" | "other";
  status: "pending" | "published" | "restricted";
  restrictionReason: ReviewRestrictionReason | null;
  replyStatus: "waiting" | "answered" | "not_applicable";
  giftCouponStatus: "waiting" | "sent";
  linked: boolean;
  mine: boolean;
  occurredAt: string;
};

export type ReviewManagementSnapshot = {
  items: ReviewManagementListItem[];
  total: number;
  page: number;
  pageSize: 20;
  pageCount: number;
  filter: ReviewListFilter;
  summary: Record<ReviewListFilter, number>;
};

export type ReviewRequestTemplate = {
  id: string;
  presetKey: ReviewProgressStage | null;
  name: string;
  body: string;
  bodyByteLength: number;
  defaultProgressStage: ReviewProgressStage;
  createdAt: string;
  updatedAt: string;
};

export type ReviewManagementDetail = {
  id: string;
  recordType: ReviewRecordType;
  receiptCode: string | null;
  authorDisplay: string;
  content: string;
  submittedPhone: string | null;
  practiceArea: ReviewManagementListItem["practiceArea"];
  progressStage: ReviewManagementListItem["progressStage"];
  experienceKeywords: string[];
  piiStatus: "clear" | "flagged" | "reviewed";
  piiFlags: string[];
  status: ReviewManagementListItem["status"];
  restrictionReason: ReviewRestrictionReason | null;
  restrictionNote: string | null;
  occurredAt: string;
  publishedAt: string | null;
  linkedCustomer: (ReviewDirectoryTarget & {
    dutyManagerUserIds: string[];
  }) | null;
  linkSource: "invitation" | "exact_phone" | "manual" | null;
  reply: {
    id: string;
    content: string;
    createdByName: string;
    updatedByName: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  canReply: boolean;
};

export type ReviewRequestBatchResult = {
  items: Array<{
    clientIdx: number;
    caseIdx: number;
    status: "sent" | "failed";
    messageId: string | null;
    errorCode: string | null;
    replayed: boolean;
  }>;
  sentCount: number;
  failedCount: number;
};

type ReviewListRow = {
  id: string;
  record_type: ReviewRecordType;
  receipt_code: string | null;
  author_display: string;
  content_preview: string | null;
  content_ciphertext: Buffer | null;
  content_nonce: Buffer | null;
  content_key_version: string | null;
  practice_area: ReviewManagementListItem["practiceArea"];
  progress_stage: ReviewManagementListItem["progressStage"];
  status: ReviewManagementListItem["status"];
  restriction_reason: ReviewRestrictionReason | null;
  reply_status: ReviewManagementListItem["replyStatus"];
  gift_coupon_status: ReviewManagementListItem["giftCouponStatus"];
  linked: boolean;
  mine: boolean;
  occurred_at: Date | string;
  total_count: string;
};

type ReviewSummaryRow = {
  all_count: string;
  reply_needed_count: string;
  pending_count: string;
  published_count: string;
  restricted_count: string;
  mine_count: string;
};

type DetailSubject = {
  reviewId: string | null;
  submissionId: string | null;
};

const PAGE_SIZE = 20 as const;
const REQUEST_EXPIRY_DAYS = 90;
const replyCreatedProfile = alias(
  staffProfiles,
  "review_reply_created_profile",
);
const replyUpdatedProfile = alias(
  staffProfiles,
  "review_reply_updated_profile",
);

export class ReviewManagementError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function recordPath(recordType: ReviewRecordType, id: string) {
  return `/reviews/${recordType}/${id}`;
}

function normalizePage(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 10_000) : 1;
}

export function serializeReviewOccurredAt(value: Date | string) {
  const occurredAt = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(occurredAt.getTime())) {
    throw new ReviewManagementError(
      "review_occurred_at_invalid",
      "후기 등록 시각을 확인할 수 없습니다.",
    );
  }
  return occurredAt.toISOString();
}

function filterSql(filter: ReviewListFilter) {
  if (filter === "reply_needed") return sql`response_needed`;
  if (filter === "pending") return sql`status = 'pending'`;
  if (filter === "published") return sql`status = 'published'`;
  if (filter === "restricted") return sql`status = 'restricted'`;
  if (filter === "mine") return sql`mine`;
  return sql`TRUE`;
}

function safeErrorCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[a-z0-9_.:-]{1,100}$/i.test(error.code)
  ) {
    return error.code;
  }
  return "review_request_send_failed";
}

export function createReviewManagementService(options: {
  db: Database;
  protection: DataProtection;
  telephonyService: Pick<TelephonyService, "requestDirectoryMessage">;
  reviewWriteUrl: string;
  now?: () => Date;
}) {
  const {
    db,
    protection,
    telephonyService,
    reviewWriteUrl,
    now = () => new Date(),
  } = options;
  const normalizedReviewWriteUrl = reviewWriteUrl.replace(/\/$/, "");

  async function ensureDefaultRequestTemplates(actor: StaffPrincipal) {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`review-request-defaults:${actor.id}`}, 0))`,
      );
      for (const template of REVIEW_REQUEST_DEFAULT_TEMPLATES) {
        const occurredAt = now();
        await tx
          .insert(customerReviewRequestTemplates)
          .values({
            id: createEventId(),
            ownerUserId: actor.id,
            presetKey: template.presetKey,
            name: template.name,
            body: template.body,
            bodyByteLength: centrexMessageByteLength(template.body),
            defaultProgressStage: template.defaultProgressStage,
            createdByUserId: actor.id,
            updatedByUserId: actor.id,
            createdAt: occurredAt,
            updatedAt: occurredAt,
          })
          .onConflictDoNothing();
      }
    });
  }

  async function list(
    actor: StaffPrincipal,
    input: { page?: number; filter?: ReviewListFilter } = {},
  ): Promise<ReviewManagementSnapshot> {
    const page = normalizePage(input.page ?? 1);
    const filter = input.filter ?? "all";
    const condition = filterSql(filter);
    const records = sql`
      WITH review_records AS (
        SELECT
          review.id,
          'review'::text AS record_type,
          submission.public_receipt_code AS receipt_code,
          review.author_display,
          left(review.content, 220) AS content_preview,
          NULL::bytea AS content_ciphertext,
          NULL::bytea AS content_nonce,
          NULL::varchar AS content_key_version,
          review.practice_area::text AS practice_area,
          review.progress_stage::text AS progress_stage,
          CASE
            WHEN review.publication_status = 'published' THEN 'published'
            ELSE 'restricted'
          END AS status,
          review.restriction_reason::text AS restriction_reason,
          CASE
            WHEN review.publication_status = 'published' AND reply.id IS NULL
              THEN 'waiting'
            WHEN reply.id IS NOT NULL THEN 'answered'
            ELSE 'not_applicable'
          END AS reply_status,
          CASE WHEN EXISTS (
            SELECT 1
            FROM review_gift_coupon_deliveries delivery
            WHERE delivery.record_type = 'review'
              AND delivery.record_id = review.id
              AND delivery.status = 'sent'
          ) THEN 'sent' ELSE 'waiting' END AS gift_coupon_status,
          link.id IS NOT NULL AS linked,
          EXISTS (
            SELECT 1
            FROM customer_review_link_managers manager
            WHERE manager.link_id = link.id
              AND manager.staff_user_id = ${actor.id}::uuid
          ) AS mine,
          review.publication_status = 'published' AND reply.id IS NULL
            AS response_needed,
          review.original_created_at AS occurred_at
        FROM customer_reviews review
        LEFT JOIN customer_review_submissions submission
          ON submission.published_review_id = review.id
        LEFT JOIN customer_review_links link
          ON link.review_id = review.id
          OR (link.review_id IS NULL AND link.submission_id = submission.id)
        LEFT JOIN customer_review_replies reply ON reply.review_id = review.id
      ),
      submission_records AS (
        SELECT
          submission.id,
          'submission'::text AS record_type,
          submission.public_receipt_code AS receipt_code,
          submission.author_display,
          NULL::text AS content_preview,
          submission.content_ciphertext,
          submission.content_nonce,
          submission.content_key_version,
          submission.practice_area::text AS practice_area,
          submission.progress_stage::text AS progress_stage,
          CASE
            WHEN submission.status = 'pending_review' THEN 'pending'
            ELSE 'restricted'
          END AS status,
          submission.decision_reason::text AS restriction_reason,
          CASE
            WHEN submission.status = 'pending_review' THEN 'waiting'
            ELSE 'not_applicable'
          END AS reply_status,
          CASE WHEN EXISTS (
            SELECT 1
            FROM review_gift_coupon_deliveries delivery
            WHERE delivery.record_type = 'submission'
              AND delivery.record_id = submission.id
              AND delivery.status = 'sent'
          ) THEN 'sent' ELSE 'waiting' END AS gift_coupon_status,
          link.id IS NOT NULL AS linked,
          EXISTS (
            SELECT 1
            FROM customer_review_link_managers manager
            WHERE manager.link_id = link.id
              AND manager.staff_user_id = ${actor.id}::uuid
          ) AS mine,
          submission.status = 'pending_review' AS response_needed,
          submission.submitted_at AS occurred_at
        FROM customer_review_submissions submission
        LEFT JOIN customer_review_links link ON link.submission_id = submission.id
        WHERE submission.status <> 'published'
      ),
      records AS (
        SELECT * FROM review_records
        UNION ALL
        SELECT * FROM submission_records
      )
      SELECT *, count(*) OVER ()::text AS total_count
      FROM records
      WHERE ${condition}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${PAGE_SIZE}
      OFFSET ${(page - 1) * PAGE_SIZE}
    `;
    const summaryQuery = sql`
      WITH records AS (
        SELECT
          CASE
            WHEN review.publication_status = 'published' THEN 'published'
            ELSE 'restricted'
          END AS status,
          link.id,
          review.publication_status = 'published' AND reply.id IS NULL
            AS response_needed,
          EXISTS (
            SELECT 1
            FROM customer_review_link_managers manager
            WHERE manager.link_id = link.id
              AND manager.staff_user_id = ${actor.id}::uuid
          ) AS mine
        FROM customer_reviews review
        LEFT JOIN customer_review_submissions submission
          ON submission.published_review_id = review.id
        LEFT JOIN customer_review_links link
          ON link.review_id = review.id
          OR (link.review_id IS NULL AND link.submission_id = submission.id)
        LEFT JOIN customer_review_replies reply ON reply.review_id = review.id
        UNION ALL
        SELECT
          CASE WHEN submission.status = 'pending_review'
            THEN 'pending' ELSE 'restricted' END AS status,
          link.id,
          submission.status = 'pending_review' AS response_needed,
          EXISTS (
            SELECT 1
            FROM customer_review_link_managers manager
            WHERE manager.link_id = link.id
              AND manager.staff_user_id = ${actor.id}::uuid
          ) AS mine
        FROM customer_review_submissions submission
        LEFT JOIN customer_review_links link ON link.submission_id = submission.id
        WHERE submission.status <> 'published'
      )
      SELECT
        count(*)::text AS all_count,
        count(*) FILTER (WHERE response_needed)::text AS reply_needed_count,
        count(*) FILTER (WHERE status = 'pending')::text AS pending_count,
        count(*) FILTER (WHERE status = 'published')::text AS published_count,
        count(*) FILTER (WHERE status = 'restricted')::text AS restricted_count,
        count(*) FILTER (WHERE mine)::text AS mine_count
      FROM records
    `;
    const [listResult, summaryResult] = await Promise.all([
      db.execute(records),
      db.execute(summaryQuery),
    ]);
    const rows = listResult.rows as ReviewListRow[];
    const summaryRow = (summaryResult.rows as ReviewSummaryRow[])[0];
    const total = Number(rows[0]?.total_count ?? 0);
    const items = rows.map((row) => {
      const content = row.content_preview ??
        (row.content_ciphertext && row.content_nonce && row.content_key_version
          ? protection.decrypt(
              {
                ciphertext: row.content_ciphertext,
                nonce: row.content_nonce,
                keyVersion: row.content_key_version,
              },
              `customer_review_submissions.content:${row.id}`,
            )
          : "");
      return {
        id: row.id,
        recordType: row.record_type,
        receiptCode: row.receipt_code,
        authorDisplay: row.author_display,
        contentPreview: content.length > 220 ? `${content.slice(0, 220)}…` : content,
        practiceArea: row.practice_area,
        progressStage: row.progress_stage,
        status: row.status,
        restrictionReason: row.restriction_reason,
        replyStatus: row.reply_status,
        giftCouponStatus: row.gift_coupon_status,
        linked: row.linked,
        mine: row.mine,
        occurredAt: serializeReviewOccurredAt(row.occurred_at),
      } satisfies ReviewManagementListItem;
    });
    return {
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      filter,
      summary: {
        all: Number(summaryRow?.all_count ?? 0),
        reply_needed: Number(summaryRow?.reply_needed_count ?? 0),
        pending: Number(summaryRow?.pending_count ?? 0),
        published: Number(summaryRow?.published_count ?? 0),
        restricted: Number(summaryRow?.restricted_count ?? 0),
        mine: Number(summaryRow?.mine_count ?? 0),
      },
    };
  }

  async function resolveSubject(
    recordType: ReviewRecordType,
    id: string,
  ): Promise<DetailSubject | null> {
    if (recordType === "review") {
      const [review] = await db
        .select({ id: customerReviews.id })
        .from(customerReviews)
        .where(eq(customerReviews.id, id))
        .limit(1);
      if (!review) return null;
      const [submission] = await db
        .select({ id: customerReviewSubmissions.id })
        .from(customerReviewSubmissions)
        .where(eq(customerReviewSubmissions.publishedReviewId, id))
        .limit(1);
      return { reviewId: id, submissionId: submission?.id ?? null };
    }
    const [submission] = await db
      .select({
        id: customerReviewSubmissions.id,
        reviewId: customerReviewSubmissions.publishedReviewId,
      })
      .from(customerReviewSubmissions)
      .where(eq(customerReviewSubmissions.id, id))
      .limit(1);
    return submission
      ? { reviewId: submission.reviewId, submissionId: submission.id }
      : null;
  }

  async function getDetail(
    recordType: ReviewRecordType,
    id: string,
    actor: StaffPrincipal,
    audit = true,
  ): Promise<ReviewManagementDetail | null> {
    const subject = await resolveSubject(recordType, id);
    if (!subject) return null;
    const [review] = subject.reviewId
      ? await db
          .select()
          .from(customerReviews)
          .where(eq(customerReviews.id, subject.reviewId))
          .limit(1)
      : [];
    const [submission] = subject.submissionId
      ? await db
          .select()
          .from(customerReviewSubmissions)
          .where(eq(customerReviewSubmissions.id, subject.submissionId))
          .limit(1)
      : [];
    if (!review && !submission) return null;

    const linkConditions = [
      ...(subject.reviewId
        ? [eq(customerReviewLinks.reviewId, subject.reviewId)]
        : []),
      ...(subject.submissionId
        ? [eq(customerReviewLinks.submissionId, subject.submissionId)]
        : []),
    ];
    const [link] = linkConditions.length
      ? await db
          .select()
          .from(customerReviewLinks)
          .where(
            linkConditions.length === 1
              ? linkConditions[0]!
              : or(...linkConditions),
          )
          .limit(1)
      : [];
    let linkedCustomer: ReviewManagementDetail["linkedCustomer"] = null;
    if (link) {
      const target = await resolveReviewDirectoryTarget(
        db,
        link.directoryClientIdx,
        link.directoryCaseIdx,
      );
      if (target) {
        const managerRows = await db
          .select({ staffUserId: customerReviewLinkManagers.staffUserId })
          .from(customerReviewLinkManagers)
          .where(eq(customerReviewLinkManagers.linkId, link.id));
        linkedCustomer = {
          ...target,
          dutyManagerUserIds: managerRows.map((row) => row.staffUserId),
        };
      }
    }

    const [replyRow] = subject.reviewId
      ? await db
          .select({
            id: customerReviewReplies.id,
            content: customerReviewReplies.content,
            createdAt: customerReviewReplies.createdAt,
            updatedAt: customerReviewReplies.updatedAt,
            createdByName: replyCreatedProfile.displayName,
            updatedByName: replyUpdatedProfile.displayName,
          })
          .from(customerReviewReplies)
          .innerJoin(
            replyCreatedProfile,
            eq(
              replyCreatedProfile.userId,
              customerReviewReplies.createdByUserId,
            ),
          )
          .innerJoin(
            replyUpdatedProfile,
            eq(
              replyUpdatedProfile.userId,
              customerReviewReplies.updatedByUserId,
            ),
          )
          .where(eq(customerReviewReplies.reviewId, subject.reviewId))
          .limit(1)
      : [];

    const content = review
      ? review.content
      : submission
        ? protection.decrypt(
            {
              ciphertext: submission.contentCiphertext,
              nonce: submission.contentNonce,
              keyVersion: submission.contentKeyVersion,
            },
            `customer_review_submissions.content:${submission.id}`,
          )
        : "";
    const submittedPhone = submission
      ? protection.decrypt(
          {
            ciphertext: submission.phoneCiphertext,
            nonce: submission.phoneNonce,
            keyVersion: submission.phoneKeyVersion,
          },
          `customer_review_submissions.phone:${submission.id}`,
        )
      : null;
    const status: ReviewManagementDetail["status"] = review
      ? review.publicationStatus === "published"
        ? "published"
        : "restricted"
      : submission?.status === "pending_review"
        ? "pending"
        : "restricted";

    if (audit) {
      const occurredAt = now();
      await db.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: "review.detail.viewed",
        targetType: recordType === "review" ? "customer_review" : "customer_review_submission",
        targetId: id,
        metadata: {
          recordType,
          linked: Boolean(link),
          hasSubmittedPhone: Boolean(submission),
        },
        occurredAt,
        createdAt: occurredAt,
      });
    }

    return {
      id,
      recordType,
      receiptCode: submission?.publicReceiptCode ?? null,
      authorDisplay: review?.authorDisplay ?? submission?.authorDisplay ?? "",
      content,
      submittedPhone,
      practiceArea: review?.practiceArea ?? submission!.practiceArea,
      progressStage: review?.progressStage ?? submission!.progressStage,
      experienceKeywords:
        review?.experienceKeywords ?? submission?.experienceKeywords ?? [],
      piiStatus: review?.piiStatus ?? submission!.piiStatus,
      piiFlags: review?.piiFlags ?? submission?.piiFlags ?? [],
      status,
      restrictionReason:
        review?.restrictionReason ?? submission?.decisionReason ?? null,
      restrictionNote:
        review?.restrictionNote ?? submission?.decisionNote ?? null,
      occurredAt: (
        review?.originalCreatedAt ?? submission!.submittedAt
      ).toISOString(),
      publishedAt: review?.publishedAt?.toISOString() ?? null,
      linkedCustomer,
      linkSource: link?.source ?? null,
      reply: replyRow
        ? {
            id: replyRow.id,
            content: replyRow.content,
            createdByName: replyRow.createdByName,
            updatedByName: replyRow.updatedByName,
            createdAt: replyRow.createdAt.toISOString(),
            updatedAt: replyRow.updatedAt.toISOString(),
          }
        : null,
      canReply: Boolean(review),
    };
  }

  async function linkCustomer(
    recordType: ReviewRecordType,
    id: string,
    rawInput: ReviewCustomerLink,
    actor: StaffPrincipal,
  ) {
    const input = reviewCustomerLinkSchema.parse(rawInput);
    const subject = await resolveSubject(recordType, id);
    if (!subject) {
      throw new ReviewManagementError("review_not_found", "후기를 찾을 수 없습니다.");
    }
    await db.transaction(async (tx) => {
      const target = await resolveReviewDirectoryTarget(
        tx,
        input.clientIdx,
        input.caseIdx,
      );
      if (!target) {
        throw new ReviewManagementError(
          "directory_target_not_found",
          "삭제되었거나 현재 조회할 수 없는 고객 사건입니다.",
        );
      }
      const conditions = [
        ...(subject.reviewId
          ? [eq(customerReviewLinks.reviewId, subject.reviewId)]
          : []),
        ...(subject.submissionId
          ? [eq(customerReviewLinks.submissionId, subject.submissionId)]
          : []),
      ];
      const [existing] = conditions.length
        ? await tx
            .select({ id: customerReviewLinks.id })
            .from(customerReviewLinks)
            .where(conditions.length === 1 ? conditions[0]! : or(...conditions))
            .limit(1)
            .for("update")
        : [];
      const linkedAt = now();
      const linkId = existing?.id ?? createEventId();
      if (existing) {
        await tx
          .update(customerReviewLinks)
          .set({
            reviewId: subject.reviewId,
            submissionId: subject.submissionId,
            directoryClientIdx: input.clientIdx,
            directoryCaseIdx: input.caseIdx,
            source: "manual",
            linkedByUserId: actor.id,
            linkedAt,
            updatedAt: linkedAt,
          })
          .where(eq(customerReviewLinks.id, linkId));
      } else {
        await tx.insert(customerReviewLinks).values({
          id: linkId,
          reviewId: subject.reviewId,
          submissionId: subject.submissionId,
          directoryClientIdx: input.clientIdx,
          directoryCaseIdx: input.caseIdx,
          source: "manual",
          linkedByUserId: actor.id,
          linkedAt,
          createdAt: linkedAt,
          updatedAt: linkedAt,
        });
      }
      await replaceReviewLinkManagers(tx, linkId, target);
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: existing ? "review.customer_link.changed" : "review.customer_link.created",
        targetType: recordType === "review" ? "customer_review" : "customer_review_submission",
        targetId: id,
        metadata: {
          directoryClientIdx: input.clientIdx,
          directoryCaseIdx: input.caseIdx,
          managerCount: target.staff.length,
        },
        occurredAt: linkedAt,
        createdAt: linkedAt,
      });
    });
    return getDetail(recordType, id, actor, false);
  }

  async function moderate(
    recordType: ReviewRecordType,
    id: string,
    rawInput: ReviewModeration,
    actor: StaffPrincipal,
  ) {
    const input = reviewModerationSchema.parse(rawInput);
    let resolvedRecordType = recordType;
    let resolvedId = id;
    await db.transaction(async (tx) => {
      const moderatedAt = now();
      if (recordType === "submission") {
        const [submission] = await tx
          .select()
          .from(customerReviewSubmissions)
          .where(eq(customerReviewSubmissions.id, id))
          .limit(1)
          .for("update");
        if (!submission) {
          throw new ReviewManagementError("review_not_found", "후기를 찾을 수 없습니다.");
        }
        if (input.action === "restrict") {
          if (submission.publishedReviewId) {
            throw new ReviewManagementError(
              "review_already_published",
              "이미 공개 원장으로 전환된 후기입니다.",
            );
          }
          await tx
            .update(customerReviewSubmissions)
            .set({
              status: "rejected",
              moderatedAt,
              moderatedByUserId: actor.id,
              decisionReason: input.reason,
              decisionNote: input.note,
              updatedAt: moderatedAt,
            })
            .where(eq(customerReviewSubmissions.id, id));
        } else {
          if (submission.publishedReviewId) {
            resolvedRecordType = "review";
            resolvedId = submission.publishedReviewId;
          } else {
            const reviewId = createEventId();
            const content = protection.decrypt(
              {
                ciphertext: submission.contentCiphertext,
                nonce: submission.contentNonce,
                keyVersion: submission.contentKeyVersion,
              },
              `customer_review_submissions.content:${submission.id}`,
            );
            await tx.insert(customerReviews).values({
              id: reviewId,
              sourceKey: "homepage_submission",
              legacyId: null,
              legacyContentId: null,
              legacyUrl: null,
              authorDisplay: maskReviewAuthorDisplay(
                submission.authorDisplay,
              ),
              title: "고객후기",
              content,
              practiceArea: submission.practiceArea,
              progressStage: submission.progressStage,
              legacyCategory1: null,
              legacyCategory2: null,
              experienceKeywords: submission.experienceKeywords,
              commentCount: 0,
              sourceStatus: "submitted",
              publicationStatus: "published",
              piiStatus: "reviewed",
              piiFlags: submission.piiFlags,
              sourceHash: null,
              importBatchId: null,
              originalCreatedAt: submission.submittedAt,
              originalUpdatedAt: moderatedAt,
              publishedAt: moderatedAt,
              restrictionReason: null,
              restrictionNote: null,
              restrictedByUserId: null,
              restrictedAt: null,
              createdAt: moderatedAt,
              updatedAt: moderatedAt,
            });
            await tx
              .update(customerReviewSubmissions)
              .set({
                status: "published",
                moderatedAt,
                moderatedByUserId: actor.id,
                decisionReason: null,
                decisionNote: null,
                publishedReviewId: reviewId,
                updatedAt: moderatedAt,
              })
              .where(eq(customerReviewSubmissions.id, id));
            await tx
              .update(customerReviewLinks)
              .set({ reviewId, updatedAt: moderatedAt })
              .where(eq(customerReviewLinks.submissionId, id));
            resolvedRecordType = "review";
            resolvedId = reviewId;
          }
        }
      } else {
        const [review] = await tx
          .select({ id: customerReviews.id })
          .from(customerReviews)
          .where(eq(customerReviews.id, id))
          .limit(1)
          .for("update");
        if (!review) {
          throw new ReviewManagementError("review_not_found", "후기를 찾을 수 없습니다.");
        }
        await tx
          .update(customerReviews)
          .set(
            input.action === "publish"
              ? {
                  publicationStatus: "published",
                  piiStatus: "reviewed",
                  publishedAt: moderatedAt,
                  restrictionReason: null,
                  restrictionNote: null,
                  restrictedByUserId: null,
                  restrictedAt: null,
                  updatedAt: moderatedAt,
                }
              : {
                  publicationStatus: "withheld",
                  publishedAt: null,
                  restrictionReason: input.reason,
                  restrictionNote: input.note,
                  restrictedByUserId: actor.id,
                  restrictedAt: moderatedAt,
                  updatedAt: moderatedAt,
                },
          )
          .where(eq(customerReviews.id, id));
      }
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: input.action === "publish" ? "review.published" : "review.restricted",
        targetType: recordType === "review" ? "customer_review" : "customer_review_submission",
        targetId: id,
        metadata: {
          action: input.action,
          reason: input.reason,
          hasNote: Boolean(input.note),
          publishedReviewId:
            resolvedRecordType === "review" ? resolvedId : null,
        },
        occurredAt: moderatedAt,
        createdAt: moderatedAt,
      });
    });
    return {
      recordType: resolvedRecordType,
      id: resolvedId,
      detail: await getDetail(resolvedRecordType, resolvedId, actor, false),
    };
  }

  async function upsertReply(
    reviewId: string,
    rawInput: ReviewReplyUpsert,
    actor: StaffPrincipal,
  ) {
    const input = reviewReplyUpsertSchema.parse(rawInput);
    const occurredAt = now();
    await db.transaction(async (tx) => {
      const [review] = await tx
        .select({ id: customerReviews.id })
        .from(customerReviews)
        .where(eq(customerReviews.id, reviewId))
        .limit(1)
        .for("key share");
      if (!review) {
        throw new ReviewManagementError("review_not_found", "후기를 찾을 수 없습니다.");
      }
      const [existing] = await tx
        .select({ id: customerReviewReplies.id })
        .from(customerReviewReplies)
        .where(eq(customerReviewReplies.reviewId, reviewId))
        .limit(1)
        .for("update");
      if (existing) {
        await tx
          .update(customerReviewReplies)
          .set({
            content: input.content,
            updatedByUserId: actor.id,
            updatedAt: occurredAt,
          })
          .where(eq(customerReviewReplies.id, existing.id));
      } else {
        await tx.insert(customerReviewReplies).values({
          id: createEventId(),
          reviewId,
          content: input.content,
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
      }
      await tx.insert(staffAuditLogs).values({
        id: createEventId(),
        actorUserId: actor.id,
        action: existing ? "review.reply.updated" : "review.reply.created",
        targetType: "customer_review",
        targetId: reviewId,
        metadata: { contentLength: input.content.length },
        occurredAt,
        createdAt: occurredAt,
      });
    });
    return getDetail("review", reviewId, actor, false);
  }

  function templateResponse(
    row: typeof customerReviewRequestTemplates.$inferSelect,
  ): ReviewRequestTemplate {
    return {
      id: row.id,
      presetKey: row.presetKey,
      name: row.name,
      body: row.body,
      bodyByteLength: row.bodyByteLength,
      defaultProgressStage: row.defaultProgressStage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async function listRequestTemplates(actor: StaffPrincipal) {
    await ensureDefaultRequestTemplates(actor);
    const rows = await db
      .select()
      .from(customerReviewRequestTemplates)
      .where(
        and(
          eq(customerReviewRequestTemplates.ownerUserId, actor.id),
          isNull(customerReviewRequestTemplates.deletedAt),
        ),
      )
      .orderBy(
        sql`CASE ${customerReviewRequestTemplates.presetKey}
          WHEN 'consultation' THEN 1
          WHEN 'commencement' THEN 2
          WHEN 'discharge' THEN 3
          WHEN 'other' THEN 4
          ELSE 5
        END`,
        desc(customerReviewRequestTemplates.updatedAt),
      );
    return { items: rows.map(templateResponse) };
  }

  async function createRequestTemplate(
    rawInput: ReviewRequestTemplateCreate,
    actor: StaffPrincipal,
  ) {
    const input = reviewRequestTemplateCreateSchema.parse(rawInput);
    await ensureDefaultRequestTemplates(actor);
    const occurredAt = now();
    const [row] = await db
      .insert(customerReviewRequestTemplates)
      .values({
        id: createEventId(),
        ownerUserId: actor.id,
        name: input.name,
        body: input.body,
        bodyByteLength: centrexMessageByteLength(input.body),
        defaultProgressStage: input.defaultProgressStage,
        createdByUserId: actor.id,
        updatedByUserId: actor.id,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      })
      .returning();
    if (!row) throw new ReviewManagementError("template_create_failed", "템플릿을 만들지 못했습니다.");
    return templateResponse(row);
  }

  async function updateRequestTemplate(
    templateId: string,
    rawInput: ReviewRequestTemplateUpdate,
    actor: StaffPrincipal,
  ) {
    const input = reviewRequestTemplateUpdateSchema.parse(rawInput);
    const [existing] = await db
      .select()
      .from(customerReviewRequestTemplates)
      .where(
        and(
          eq(customerReviewRequestTemplates.id, templateId),
          eq(customerReviewRequestTemplates.ownerUserId, actor.id),
          isNull(customerReviewRequestTemplates.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new ReviewManagementError("template_not_found", "내 후기 요청 템플릿을 찾을 수 없습니다.");
    }
    const preset = existing.presetKey
      ? REVIEW_REQUEST_DEFAULT_TEMPLATES.find(
          (template) => template.presetKey === existing.presetKey,
        )
      : null;
    if (
      preset &&
      (input.name !== preset.name ||
        input.defaultProgressStage !== preset.defaultProgressStage)
    ) {
      throw new ReviewManagementError(
        "template_preset_locked",
        "기본 템플릿의 이름과 후기 시점은 바꿀 수 없습니다. 문자 내용은 자유롭게 수정할 수 있습니다.",
      );
    }
    const [row] = await db
      .update(customerReviewRequestTemplates)
      .set({
        name: input.name,
        body: input.body,
        bodyByteLength: centrexMessageByteLength(input.body),
        defaultProgressStage: input.defaultProgressStage,
        updatedByUserId: actor.id,
        updatedAt: now(),
      })
      .where(
        and(
          eq(customerReviewRequestTemplates.id, templateId),
          eq(customerReviewRequestTemplates.ownerUserId, actor.id),
          isNull(customerReviewRequestTemplates.deletedAt),
        ),
      )
      .returning();
    if (!row) throw new ReviewManagementError("template_not_found", "내 후기 요청 템플릿을 찾을 수 없습니다.");
    return templateResponse(row);
  }

  async function deleteRequestTemplate(templateId: string, actor: StaffPrincipal) {
    const [template] = await db
      .select({
        id: customerReviewRequestTemplates.id,
        presetKey: customerReviewRequestTemplates.presetKey,
        deletedAt: customerReviewRequestTemplates.deletedAt,
      })
      .from(customerReviewRequestTemplates)
      .where(
        and(
          eq(customerReviewRequestTemplates.id, templateId),
          eq(customerReviewRequestTemplates.ownerUserId, actor.id),
        ),
      )
      .limit(1);
    if (!template) {
      throw new ReviewManagementError("template_not_found", "내 후기 요청 템플릿을 찾을 수 없습니다.");
    }
    if (template.presetKey) {
      throw new ReviewManagementError(
        "template_preset_required",
        "기본 후기 요청 템플릿은 삭제할 수 없습니다. 문자 내용은 자유롭게 수정할 수 있습니다.",
      );
    }
    if (!template.deletedAt) {
      const deletedAt = now();
      await db.transaction(async (tx) => {
        const [deleted] = await tx
          .update(customerReviewRequestTemplates)
          .set({
            deletedAt,
            updatedByUserId: actor.id,
            updatedAt: deletedAt,
          })
          .where(
            and(
              eq(customerReviewRequestTemplates.id, templateId),
              eq(customerReviewRequestTemplates.ownerUserId, actor.id),
              isNull(customerReviewRequestTemplates.deletedAt),
            ),
          )
          .returning({ id: customerReviewRequestTemplates.id });
        if (deleted) {
          await tx.insert(staffAuditLogs).values({
            id: createEventId(),
            actorUserId: actor.id,
            action: "review.request_template.deleted",
            targetType: "customer_review_request_template",
            targetId: templateId,
            metadata: { softDelete: true },
            occurredAt: deletedAt,
            createdAt: deletedAt,
          });
        }
      });
    }
    return { id: template.id, deleted: true as const };
  }

  async function sendRequests(
    rawInput: ReviewRequestBatchSend,
    actor: StaffPrincipal,
  ): Promise<ReviewRequestBatchResult> {
    const input = reviewRequestBatchSendSchema.parse(rawInput);
    const [template] = await db
      .select()
      .from(customerReviewRequestTemplates)
      .where(
        and(
          eq(customerReviewRequestTemplates.id, input.templateId),
          eq(customerReviewRequestTemplates.ownerUserId, actor.id),
          isNull(customerReviewRequestTemplates.deletedAt),
        ),
      )
      .limit(1);
    if (!template) {
      throw new ReviewManagementError("template_not_found", "내 후기 요청 템플릿을 찾을 수 없습니다.");
    }

    const items: ReviewRequestBatchResult["items"] = [];
    for (const targetInput of input.targets) {
      const existingRows = await db
        .select()
        .from(customerReviewRequests)
        .where(eq(customerReviewRequests.idempotencyKey, targetInput.idempotencyKey))
        .limit(1);
      const existing = existingRows[0];
      if (existing) {
        if (
          existing.requestedByUserId !== actor.id ||
          existing.directoryClientIdx !== targetInput.clientIdx ||
          existing.directoryCaseIdx !== targetInput.caseIdx ||
          existing.templateId !== input.templateId
        ) {
          throw new ReviewManagementError(
            "request_idempotency_conflict",
            "후기 요청 재시도 식별자가 다른 고객과 충돌했습니다.",
          );
        }
        if (existing.status !== "queued") {
          items.push({
            clientIdx: targetInput.clientIdx,
            caseIdx: targetInput.caseIdx,
            status:
              existing.status === "sent" || existing.status === "redeemed"
                ? "sent"
                : "failed",
            messageId: existing.telephonyMessageId,
            errorCode:
              existing.lastErrorCode ??
              (existing.status === "cancelled"
                ? "review_request_cancelled"
                : null),
            replayed: true,
          });
          continue;
        }
      }

      const target = await resolveReviewDirectoryTarget(
        db,
        targetInput.clientIdx,
        targetInput.caseIdx,
      );
      if (!target) {
        if (existing?.status === "queued") {
          const failedAt = now();
          await db
            .update(customerReviewRequests)
            .set({
              status: "failed",
              failedAt,
              lastErrorCode: "directory_target_not_found",
              updatedAt: failedAt,
            })
            .where(
              and(
                eq(customerReviewRequests.id, existing.id),
                eq(customerReviewRequests.status, "queued"),
              ),
            );
        }
        items.push({
          clientIdx: targetInput.clientIdx,
          caseIdx: targetInput.caseIdx,
          status: "failed",
          messageId: null,
          errorCode: "directory_target_not_found",
          replayed: false,
        });
        continue;
      }
      const requestId = existing?.id ?? createEventId();
      const requestedAt = existing?.requestedAt ?? now();
      const expiresAt = existing?.expiresAt ?? new Date(requestedAt);
      const suggestedPracticeArea =
        reviewPracticeAreaFromDirectoryCaseType(target.caseType);
      const suggestedProgressStage = template.defaultProgressStage;
      if (!existing) {
        expiresAt.setUTCDate(expiresAt.getUTCDate() + REQUEST_EXPIRY_DAYS);
        await db.insert(customerReviewRequests).values({
          id: requestId,
          idempotencyKey: targetInput.idempotencyKey,
          directoryClientIdx: targetInput.clientIdx,
          directoryCaseIdx: targetInput.caseIdx,
          requestedByUserId: actor.id,
          templateId: input.templateId,
          suggestedPracticeArea,
          suggestedProgressStage,
          status: "queued",
          requestedAt,
          expiresAt,
          createdAt: requestedAt,
          updatedAt: requestedAt,
        });
      } else {
        await db
          .update(customerReviewRequests)
          .set({
            suggestedPracticeArea,
            suggestedProgressStage,
            updatedAt: now(),
          })
          .where(
            and(
              eq(customerReviewRequests.id, requestId),
              eq(customerReviewRequests.status, "queued"),
            ),
          );
      }
      if (expiresAt <= now()) {
        const failedAt = now();
        await db
          .update(customerReviewRequests)
          .set({
            status: "failed",
            failedAt,
            lastErrorCode: "review_request_expired",
            updatedAt: failedAt,
          })
          .where(
            and(
              eq(customerReviewRequests.id, requestId),
              eq(customerReviewRequests.status, "queued"),
            ),
          );
        items.push({
          clientIdx: targetInput.clientIdx,
          caseIdx: targetInput.caseIdx,
          status: "failed",
          messageId: null,
          errorCode: "review_request_expired",
          replayed: true,
        });
        continue;
      }
      const token = createReviewRequestToken(requestId, protection);
      const link = `${normalizedReviewWriteUrl}#request=${encodeURIComponent(token)}`;
      const body = renderReviewRequestTemplate(template.body, {
        "{{고객명}}": target.clientName,
        "{{담당자명}}": actor.displayName,
        "{{사건번호}}": target.caseNumber ?? "미등록",
        "{{후기작성링크}}": link,
      });
      let message: Awaited<
        ReturnType<TelephonyService["requestDirectoryMessage"]>
      >;
      try {
        message = await telephonyService.requestDirectoryMessage(
          {
            clientIdx: targetInput.clientIdx,
            caseIdx: targetInput.caseIdx,
          },
          {
            idempotencyKey: targetInput.idempotencyKey,
            templateId: null,
            body,
          },
          actor,
        );
      } catch (error) {
        const errorCode = safeErrorCode(error);
        const failedAt = now();
        await db
          .update(customerReviewRequests)
          .set({
            status: "failed",
            failedAt,
            lastErrorCode: errorCode,
            updatedAt: failedAt,
          })
          .where(
            and(
              eq(customerReviewRequests.id, requestId),
              eq(customerReviewRequests.status, "queued"),
            ),
          );
        items.push({
          clientIdx: targetInput.clientIdx,
          caseIdx: targetInput.caseIdx,
          status: "failed",
          messageId: null,
          errorCode,
          replayed: false,
        });
        continue;
      }
      const sentAt = now();
      await db.transaction(async (tx) => {
        const [finalized] = await tx
          .update(customerReviewRequests)
          .set({
            telephonyMessageId: message.id,
            status: "sent",
            sentAt,
            updatedAt: sentAt,
          })
          .where(
            and(
              eq(customerReviewRequests.id, requestId),
              eq(customerReviewRequests.status, "queued"),
            ),
          )
          .returning({ id: customerReviewRequests.id });
        if (finalized) {
          await tx.insert(staffAuditLogs).values({
            id: createEventId(),
            actorUserId: actor.id,
            action: "review.request.sent",
            targetType: "customer_review_request",
            targetId: requestId,
            metadata: {
              directoryClientIdx: targetInput.clientIdx,
              directoryCaseIdx: targetInput.caseIdx,
              templateId: input.templateId,
              telephonyMessageId: message.id,
              expiresAt: expiresAt.toISOString(),
              suggestedPracticeArea,
              suggestedProgressStage,
            },
            occurredAt: sentAt,
            createdAt: sentAt,
          });
        }
      });
      items.push({
        clientIdx: targetInput.clientIdx,
        caseIdx: targetInput.caseIdx,
        status: "sent",
        messageId: message.id,
        errorCode: null,
        replayed: Boolean(existing || message.replayed),
      });
    }
    return {
      items,
      sentCount: items.filter((item) => item.status === "sent").length,
      failedCount: items.filter((item) => item.status === "failed").length,
    };
  }

  async function dutyCount(actor: StaffPrincipal) {
    const result = await db.execute(sql<{ count: string }>`
      SELECT count(DISTINCT link.id)::text AS count
      FROM customer_review_links link
      INNER JOIN customer_review_link_managers manager
        ON manager.link_id = link.id
        AND manager.staff_user_id = ${actor.id}::uuid
      LEFT JOIN customer_review_submissions submission
        ON submission.id = link.submission_id
      LEFT JOIN customer_reviews review
        ON review.id = link.review_id
      LEFT JOIN customer_review_replies reply
        ON reply.review_id = review.id
      WHERE
        (submission.status = 'pending_review')
        OR (review.publication_status = 'published' AND reply.id IS NULL)
    `);
    return { count: Number((result.rows as Array<{ count: string }>)[0]?.count ?? 0) };
  }

  async function notification(
    recordType: ReviewRecordType,
    id: string,
    actor: StaffPrincipal,
  ) {
    const condition = recordType === "review"
      ? eq(customerReviewLinks.reviewId, id)
      : eq(customerReviewLinks.submissionId, id);
    const [linked] = await db
      .select({ linkId: customerReviewLinks.id })
      .from(customerReviewLinks)
      .innerJoin(
        customerReviewLinkManagers,
        and(
          eq(customerReviewLinkManagers.linkId, customerReviewLinks.id),
          eq(customerReviewLinkManagers.staffUserId, actor.id),
        ),
      )
      .where(condition)
      .limit(1);
    if (!linked) return null;
    const detail = await getDetail(recordType, id, actor, false);
    if (
      !detail ||
      !detail.linkedCustomer ||
      detail.status === "restricted" ||
      (detail.recordType === "review" && detail.reply)
    ) {
      return null;
    }
    return {
      id,
      recordType,
      href: recordPath(recordType, id),
      customerName: detail.linkedCustomer.clientName,
      receiptCode: detail.receiptCode,
      caseNumber: detail.linkedCustomer.caseNumber,
      caseName: detail.linkedCustomer.caseName,
      managerNames: detail.linkedCustomer.staff.map((staff) => staff.name),
      status: detail.status,
    };
  }

  return {
    list,
    getDetail,
    linkCustomer,
    moderate,
    upsertReply,
    listRequestTemplates,
    createRequestTemplate,
    updateRequestTemplate,
    deleteRequestTemplate,
    sendRequests,
    dutyCount,
    notification,
  };
}

export type ReviewManagementService = ReturnType<
  typeof createReviewManagementService
>;
