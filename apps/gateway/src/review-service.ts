import {
  and,
  desc,
  eq,
  gte,
  sql,
} from "drizzle-orm";

import {
  createEventId,
  createReviewReceiptCode,
  createReviewSubmissionId,
  detectReviewPiiFlags,
  reviewRequestContextRequestSchema,
  reviewSubmissionSchema,
  type ReviewRequestContextRequest,
  type ReviewRequestContextResponse,
  type ReviewSubmission,
  type ReviewSubmissionResponse,
} from "@lawand/core";
import {
  customerReviewLinks,
  customerReviewRequests,
  customerReviewSubmissions,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";
import {
  replaceReviewLinkManagers,
  resolveExactPhoneReviewDirectoryTarget,
  resolveReviewDirectoryTarget,
  type ReviewDirectoryTarget,
} from "./review-directory.js";
import { verifyReviewRequestToken } from "./review-token.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const EXACT_DUPLICATE_WINDOW_MS = 10 * 60 * 1_000;
const RETENTION_YEARS = 1;

export class ReviewSubmissionValidationError extends Error {}

export function maskedReviewAuthorDisplay(clientName: string): string {
  const firstCharacter = Array.from(clientName.trim()).find((value) => /\S/u.test(value));
  return `${firstCharacter ?? "고"}○○ 고객`;
}

function invitationPhone(value: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return /^010\d{8}$/.test(digits) ? digits : null;
}

function replayResponse(row: {
  publicReceiptCode: string;
  submittedAt: Date;
}): ReviewSubmissionResponse {
  return {
    publicReceiptCode: row.publicReceiptCode,
    acceptedAt: row.submittedAt.toISOString(),
    status: "pending_review",
    replayed: true,
  };
}

export function createReviewSubmissionService(options: {
  db: Database;
  protection: DataProtection;
}) {
  const { db, protection } = options;

  async function getRequestContext(
    rawInput: ReviewRequestContextRequest,
  ): Promise<ReviewRequestContextResponse> {
    const input = reviewRequestContextRequestSchema.parse(rawInput);
    const requestId = verifyReviewRequestToken(input.requestToken, protection);
    if (!requestId) {
      throw new ReviewSubmissionValidationError(
        "후기 요청 링크가 올바르지 않습니다.",
      );
    }
    const checkedAt = new Date();
    const [requestRecord] = await db
      .select({
        status: customerReviewRequests.status,
        clientIdx: customerReviewRequests.directoryClientIdx,
        caseIdx: customerReviewRequests.directoryCaseIdx,
        suggestedPracticeArea: customerReviewRequests.suggestedPracticeArea,
        suggestedProgressStage: customerReviewRequests.suggestedProgressStage,
        expiresAt: customerReviewRequests.expiresAt,
      })
      .from(customerReviewRequests)
      .where(eq(customerReviewRequests.id, requestId))
      .limit(1);
    if (
      !requestRecord ||
      requestRecord.status !== "sent" ||
      requestRecord.expiresAt <= checkedAt
    ) {
      throw new ReviewSubmissionValidationError(
        "후기 요청 링크가 만료됐거나 이미 사용되었습니다.",
      );
    }
    const target = await resolveReviewDirectoryTarget(
      db,
      requestRecord.clientIdx,
      requestRecord.caseIdx,
    );
    if (!target || !invitationPhone(target.phone)) {
      throw new ReviewSubmissionValidationError(
        "후기 요청에 연결된 고객 사건을 확인할 수 없습니다.",
      );
    }
    return {
      authorDisplay: maskedReviewAuthorDisplay(target.clientName),
      practiceArea: requestRecord.suggestedPracticeArea,
      progressStage: requestRecord.suggestedProgressStage,
      expiresAt: requestRecord.expiresAt.toISOString(),
    };
  }

  async function submit(
    rawSubmission: ReviewSubmission,
  ): Promise<ReviewSubmissionResponse> {
    const submission = reviewSubmissionSchema.parse(rawSubmission);
    const submittedAt = new Date();
    const consentAgreedAt = new Date(submission.consentAgreedAt);
    if (
      consentAgreedAt.getTime() <
        submittedAt.getTime() - 24 * 60 * 60 * 1_000 ||
      consentAgreedAt.getTime() > submittedAt.getTime() + 5 * 60 * 1_000
    ) {
      throw new ReviewSubmissionValidationError(
        "동의 시각이 유효하지 않습니다. 화면을 새로고침해 주세요.",
      );
    }

    return db.transaction(async (tx) => {
      const [idempotentSubmission] = await tx
        .select({
          publicReceiptCode: customerReviewSubmissions.publicReceiptCode,
          submittedAt: customerReviewSubmissions.submittedAt,
        })
        .from(customerReviewSubmissions)
        .where(
          and(
            eq(customerReviewSubmissions.source, submission.source),
            eq(
              customerReviewSubmissions.idempotencyKey,
              submission.idempotencyKey,
            ),
          ),
        )
        .limit(1);
      if (idempotentSubmission) {
        return replayResponse(idempotentSubmission);
      }

      let authorDisplay = submission.authorDisplay ?? null;
      let phone = submission.phone ?? null;
      let linkSource: "invitation" | "exact_phone" | null = null;
      let reviewRequestId: string | null = null;
      let target: ReviewDirectoryTarget | null = null;
      if (submission.requestToken) {
        reviewRequestId = verifyReviewRequestToken(
          submission.requestToken,
          protection,
        );
        if (!reviewRequestId) {
          throw new ReviewSubmissionValidationError(
            "후기 요청 링크가 올바르지 않습니다.",
          );
        }
        const [requestRecord] = await tx
          .select({
            status: customerReviewRequests.status,
            clientIdx: customerReviewRequests.directoryClientIdx,
            caseIdx: customerReviewRequests.directoryCaseIdx,
            expiresAt: customerReviewRequests.expiresAt,
          })
          .from(customerReviewRequests)
          .where(eq(customerReviewRequests.id, reviewRequestId))
          .limit(1)
          .for("update");
        if (
          !requestRecord ||
          requestRecord.status !== "sent" ||
          requestRecord.expiresAt <= submittedAt
        ) {
          throw new ReviewSubmissionValidationError(
            "후기 요청 링크가 만료됐거나 이미 사용되었습니다.",
          );
        }
        target = await resolveReviewDirectoryTarget(
          tx,
          requestRecord.clientIdx,
          requestRecord.caseIdx,
        );
        phone = target ? invitationPhone(target.phone) : null;
        if (!target || !phone) {
          throw new ReviewSubmissionValidationError(
            "후기 요청에 연결된 고객 사건을 확인할 수 없습니다.",
          );
        }
        authorDisplay = maskedReviewAuthorDisplay(target.clientName);
        linkSource = "invitation";
      }
      if (!authorDisplay || !phone) {
        throw new ReviewSubmissionValidationError(
          "공개 이름과 휴대전화 번호를 확인해 주세요.",
        );
      }

      const phoneFingerprint = protection.fingerprint({
        kind: "review-submission-phone-v1",
        phone,
      });
      const payloadFingerprint = protection.fingerprint({
        kind: "review-submission-payload-v1",
        authorDisplay,
        content: submission.content,
        experienceKeywords: submission.experienceKeywords,
        phone,
        practiceArea: submission.practiceArea,
        progressStage: submission.progressStage,
      });
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${protection.advisoryLockKey(phoneFingerprint)}::bigint)`,
      );

      if (!submission.requestToken) {
        const [exactDuplicate] = await tx
          .select({
            publicReceiptCode: customerReviewSubmissions.publicReceiptCode,
            submittedAt: customerReviewSubmissions.submittedAt,
          })
          .from(customerReviewSubmissions)
          .where(
            and(
              eq(
                customerReviewSubmissions.phoneFingerprint,
                phoneFingerprint,
              ),
              eq(
                customerReviewSubmissions.payloadFingerprint,
                payloadFingerprint,
              ),
              gte(
                customerReviewSubmissions.submittedAt,
                new Date(submittedAt.getTime() - EXACT_DUPLICATE_WINDOW_MS),
              ),
            ),
          )
          .orderBy(desc(customerReviewSubmissions.submittedAt))
          .limit(1);
        if (exactDuplicate) {
          return replayResponse(exactDuplicate);
        }
      }

      const id = createReviewSubmissionId();
      const publicReceiptCode = createReviewReceiptCode(submittedAt);
      const phoneEncrypted = protection.encrypt(
        phone,
        `customer_review_submissions.phone:${id}`,
      );
      const contentEncrypted = protection.encrypt(
        submission.content,
        `customer_review_submissions.content:${id}`,
      );
      const piiFlags = detectReviewPiiFlags(
        `${authorDisplay}\n${submission.content}`,
      );
      const retentionExpiresAt = new Date(submittedAt);
      retentionExpiresAt.setUTCFullYear(
        retentionExpiresAt.getUTCFullYear() + RETENTION_YEARS,
      );

      await tx.insert(customerReviewSubmissions).values({
        id,
        publicReceiptCode,
        source: submission.source,
        idempotencyKey: submission.idempotencyKey,
        authorDisplay,
        practiceArea: submission.practiceArea,
        progressStage: submission.progressStage,
        experienceKeywords: submission.experienceKeywords,
        phoneFingerprint,
        phoneCiphertext: phoneEncrypted.ciphertext,
        phoneNonce: phoneEncrypted.nonce,
        phoneKeyVersion: phoneEncrypted.keyVersion,
        contentCiphertext: contentEncrypted.ciphertext,
        contentNonce: contentEncrypted.nonce,
        contentKeyVersion: contentEncrypted.keyVersion,
        payloadFingerprint,
        piiStatus: piiFlags.length > 0 ? "flagged" : "clear",
        piiFlags,
        status: "pending_review",
        privacyNoticeVersion: submission.privacyNoticeVersion,
        publicationConsentVersion: submission.publicationConsentVersion,
        consentAgreedAt,
        submittedAt,
        retentionExpiresAt,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      });

      if (!submission.requestToken) {
        target = await resolveExactPhoneReviewDirectoryTarget(
          tx,
          phone,
        );
        if (target) linkSource = "exact_phone";
      }

      if (target && linkSource) {
        const linkId = createEventId();
        await tx.insert(customerReviewLinks).values({
          id: linkId,
          reviewId: null,
          submissionId: id,
          directoryClientIdx: target.clientIdx,
          directoryCaseIdx: target.caseIdx,
          source: linkSource,
          linkedByUserId: null,
          linkedAt: submittedAt,
          createdAt: submittedAt,
          updatedAt: submittedAt,
        });
        await replaceReviewLinkManagers(tx, linkId, target);
      }

      if (reviewRequestId) {
        await tx
          .update(customerReviewRequests)
          .set({
            status: "redeemed",
            redeemedSubmissionId: id,
            redeemedAt: submittedAt,
            updatedAt: submittedAt,
          })
          .where(eq(customerReviewRequests.id, reviewRequestId));
      }

      return {
        publicReceiptCode,
        acceptedAt: submittedAt.toISOString(),
        status: "pending_review",
        replayed: false,
      };
    });
  }

  return { getRequestContext, submit };
}

export type ReviewSubmissionService = ReturnType<
  typeof createReviewSubmissionService
>;
