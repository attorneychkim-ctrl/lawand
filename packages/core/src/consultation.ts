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
  submittedAt: Date;
};

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

  const suspectedDuplicate = activePhoneMatches.find(
    (candidate) =>
      elapsedMs(submission.submittedAt, candidate.latestRequestAt) <=
      DEDUPE_WINDOWS.suspectedDuplicateMs,
  );

  if (suspectedDuplicate) {
    return {
      action: "create_suspected_duplicate",
      candidateConsultationId: suspectedDuplicate.consultationId,
      createConsultation: true,
      createRequest: true,
      eventTypes: [
        "consultation.requested",
        "consultation.duplicate_suspected",
      ],
    };
  }

  return {
    action: "create_new",
    createConsultation: true,
    createRequest: true,
    eventTypes: ["consultation.requested"],
  };
}
