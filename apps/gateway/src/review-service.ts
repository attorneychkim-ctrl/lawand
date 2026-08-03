import {
  and,
  desc,
  eq,
  gte,
  sql,
} from "drizzle-orm";

import {
  createReviewReceiptCode,
  createReviewSubmissionId,
  detectReviewPiiFlags,
  reviewSubmissionSchema,
  type ReviewSubmission,
  type ReviewSubmissionResponse,
} from "@lawand/core";
import {
  customerReviewSubmissions,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

const EXACT_DUPLICATE_WINDOW_MS = 10 * 60 * 1_000;
const RETENTION_YEARS = 1;

export class ReviewSubmissionValidationError extends Error {}

export function createReviewSubmissionService(options: {
  db: Database;
  protection: DataProtection;
}) {
  const { db, protection } = options;

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

    const phoneFingerprint = protection.fingerprint({
      kind: "review-submission-phone-v1",
      phone: submission.phone,
    });
    const payloadFingerprint = protection.fingerprint({
      kind: "review-submission-payload-v1",
      authorDisplay: submission.authorDisplay,
      content: submission.content,
      experienceKeywords: submission.experienceKeywords,
      phone: submission.phone,
      practiceArea: submission.practiceArea,
      progressStage: submission.progressStage,
    });

    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${protection.advisoryLockKey(phoneFingerprint)}::bigint)`,
      );

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
        return {
          publicReceiptCode: idempotentSubmission.publicReceiptCode,
          acceptedAt: idempotentSubmission.submittedAt.toISOString(),
          status: "pending_review",
          replayed: true,
        };
      }

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
        return {
          publicReceiptCode: exactDuplicate.publicReceiptCode,
          acceptedAt: exactDuplicate.submittedAt.toISOString(),
          status: "pending_review",
          replayed: true,
        };
      }

      const id = createReviewSubmissionId();
      const publicReceiptCode = createReviewReceiptCode(submittedAt);
      const phoneEncrypted = protection.encrypt(
        submission.phone,
        `customer_review_submissions.phone:${id}`,
      );
      const contentEncrypted = protection.encrypt(
        submission.content,
        `customer_review_submissions.content:${id}`,
      );
      const piiFlags = detectReviewPiiFlags(
        `${submission.authorDisplay}\n${submission.content}`,
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
        authorDisplay: submission.authorDisplay,
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

      return {
        publicReceiptCode,
        acceptedAt: submittedAt.toISOString(),
        status: "pending_review",
        replayed: false,
      };
    });
  }

  return { submit };
}

export type ReviewSubmissionService = ReturnType<
  typeof createReviewSubmissionService
>;
