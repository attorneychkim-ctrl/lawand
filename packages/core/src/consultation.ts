import { z } from "zod";

export const consultationModeSchema = z.enum([
  "quick",
  "detailed",
  "self_diagnosis",
]);
export const consultationStateSchema = z.enum([
  "requested",
  "assigned",
  "contacted",
  "completed",
  "engaged",
  "closed",
]);

export const dedupeOutcomeSchema = z.enum([
  "new",
  "exact_duplicate",
  "identity_enrichment",
  "repeat_unassigned",
  "repeat_assigned",
  "suspected_duplicate",
]);

export type ConsultationState = z.infer<typeof consultationStateSchema>;
export type DedupeOutcome = z.infer<typeof dedupeOutcomeSchema>;

export const DEDUPE_WINDOWS = {
  exactDuplicateMs: 10 * 60 * 1_000,
  identityEnrichmentMs: 30 * 60 * 1_000,
  suspectedDuplicateMs: 7 * 24 * 60 * 60 * 1_000,
} as const;

export type ExistingConsultationCandidate = {
  consultationId: string;
  latestRequestId: string;
  state: ConsultationState;
  phoneFingerprint: string;
  latestPayloadFingerprint: string;
  latestJourneySessionId: string | null;
  hasProvidedName: boolean;
  nameFingerprint: string | null;
  latestRequestAt: Date;
};

export type DedupeSubmission = {
  idempotencyRequest?: {
    consultationId: string;
    requestId: string;
  };
  phoneFingerprint: string;
  payloadFingerprint: string;
  journeySessionId: string | null;
  hasProvidedName: boolean;
  nameFingerprint: string | null;
  submittedAt: Date;
};

export const consultationGroupLinkSchema = z
  .object({
    targetReceiptCode: z
      .string()
      .trim()
      .regex(/^LA-\d{6}-[23456789A-HJ-NP-Z]{8}$/),
  })
  .strict();

export type ConsultationGroupLink = z.infer<
  typeof consultationGroupLinkSchema
>;

export type DedupeDecision =
  | {
      action: "idempotent_replay";
      consultationId: string;
      requestId: string;
      createConsultation: false;
      createRequest: false;
      eventTypes: [];
    }
  | {
      action: "attach_exact_duplicate";
      consultationId: string;
      matchedRequestId: string;
      createConsultation: false;
      createRequest: true;
      eventTypes: [];
    }
  | {
      action: "attach_identity_enrichment";
      consultationId: string;
      matchedRequestId: string;
      createConsultation: false;
      createRequest: true;
      eventTypes: ["consultation.request.updated"];
    }
  | {
      action: "attach_repeat_request";
      stage: "before_assignment" | "after_assignment";
      consultationId: string;
      matchedRequestId: string;
      createConsultation: false;
      createRequest: true;
      eventTypes: ["consultation.request.updated"];
    }
  | {
      action: "create_suspected_duplicate";
      candidateConsultationId: string;
      createConsultation: true;
      createRequest: true;
      eventTypes: [
        "consultation.requested",
        "consultation.duplicate_suspected",
      ];
    }
  | {
      action: "create_new";
      createConsultation: true;
      createRequest: true;
      eventTypes: ["consultation.requested"];
    };

function elapsedMs(submittedAt: Date, candidateAt: Date): number {
  return submittedAt.getTime() - candidateAt.getTime();
}

function newestFirst(
  candidates: ExistingConsultationCandidate[],
): ExistingConsultationCandidate[] {
  return [...candidates].sort(
    (left, right) =>
      right.latestRequestAt.getTime() - left.latestRequestAt.getTime(),
  );
}

export function classifyConsultationSubmission(
  submission: DedupeSubmission,
  candidates: ExistingConsultationCandidate[],
): DedupeDecision {
  if (submission.idempotencyRequest) {
    return {
      action: "idempotent_replay",
      consultationId: submission.idempotencyRequest.consultationId,
      requestId: submission.idempotencyRequest.requestId,
      createConsultation: false,
      createRequest: false,
      eventTypes: [],
    };
  }

  const activePhoneMatches = newestFirst(candidates).filter(
    (candidate) =>
      candidate.state !== "closed" &&
      candidate.phoneFingerprint === submission.phoneFingerprint &&
      elapsedMs(submission.submittedAt, candidate.latestRequestAt) >= 0,
  );

  const exactDuplicate = activePhoneMatches.find(
    (candidate) =>
      candidate.latestPayloadFingerprint === submission.payloadFingerprint &&
      elapsedMs(submission.submittedAt, candidate.latestRequestAt) <=
        DEDUPE_WINDOWS.exactDuplicateMs,
  );

  if (exactDuplicate) {
    return {
      action: "attach_exact_duplicate",
      consultationId: exactDuplicate.consultationId,
      matchedRequestId: exactDuplicate.latestRequestId,
      createConsultation: false,
      createRequest: true,
      eventTypes: [],
    };
  }

  const identityEnrichment = activePhoneMatches.find(
    (candidate) =>
      candidate.latestJourneySessionId !== null &&
      candidate.latestJourneySessionId === submission.journeySessionId &&
      !candidate.hasProvidedName &&
      submission.hasProvidedName &&
      elapsedMs(submission.submittedAt, candidate.latestRequestAt) <=
        DEDUPE_WINDOWS.identityEnrichmentMs,
  );

  if (identityEnrichment) {
    return {
      action: "attach_identity_enrichment",
      consultationId: identityEnrichment.consultationId,
      matchedRequestId: identityEnrichment.latestRequestId,
      createConsultation: false,
      createRequest: true,
      eventTypes: ["consultation.request.updated"],
    };
  }

  const repeatRequest = activePhoneMatches.find(
    (candidate) =>
      elapsedMs(submission.submittedAt, candidate.latestRequestAt) <=
      DEDUPE_WINDOWS.suspectedDuplicateMs,
  );

  if (repeatRequest) {
    return {
      action: "attach_repeat_request",
      stage:
        repeatRequest.state === "requested"
          ? "before_assignment"
          : "after_assignment",
      consultationId: repeatRequest.consultationId,
      matchedRequestId: repeatRequest.latestRequestId,
      createConsultation: false,
      createRequest: true,
      eventTypes: ["consultation.request.updated"],
    };
  }

  return {
    action: "create_new",
    createConsultation: true,
    createRequest: true,
    eventTypes: ["consultation.requested"],
  };
}

export const legalFriendsConsultationHandlingSchema = z.discriminatedUnion(
  "mode",
  [
    z
      .object({
        mode: z.literal("existing_case"),
        clientIdx: z.number().int().positive(),
        caseIdx: z.number().int().positive(),
      })
      .strict(),
    z.object({ mode: z.literal("new_matter") }).strict(),
    z.object({ mode: z.literal("shared_contact") }).strict(),
  ],
);

export const consultationAssignmentInputSchema = z
  .object({
    legalFriendsHandling: legalFriendsConsultationHandlingSchema.optional(),
  })
  .strict();

export const consultationAssigneeTransferReasonSchema = z.enum([
  "workload_balance",
  "absence",
  "expertise",
  "manager_adjustment",
  "other",
]);

export const consultationAssigneeTransferInputSchema = z
  .object({
    targetStaffUserId: z.uuid(),
    reason: consultationAssigneeTransferReasonSchema,
  })
  .strict();

export type LegalFriendsConsultationHandling = z.infer<
  typeof legalFriendsConsultationHandlingSchema
>;
export type ConsultationAssigneeTransferReason = z.infer<
  typeof consultationAssigneeTransferReasonSchema
>;
export type ConsultationAssigneeTransferInput = z.infer<
  typeof consultationAssigneeTransferInputSchema
>;
