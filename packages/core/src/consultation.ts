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

export const consultationCustomerNameTagSchema = z.enum([
  "none",
  "existing",
  "referral",
]);

export type ConsultationCustomerNameTag = z.infer<
  typeof consultationCustomerNameTagSchema
>;

export const CONSULTATION_CUSTOMER_NAME_MAX_LENGTH = 50;
export const CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL = "고객명 확인 필요";
export const CONSULTATION_CUSTOMER_NAME_UNSAFE_MESSAGE =
  "고객명에는 <, > 또는 줄바꿈·제어 문자를 사용할 수 없습니다.";

export function hasUnsafeConsultationCustomerNameSyntax(
  value: string,
): boolean {
  return [...value.normalize("NFKC")].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      character === "<" ||
      character === ">" ||
      codePoint === undefined ||
      codePoint <= 31 ||
      (codePoint >= 127 && codePoint <= 159) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029
    );
  });
}

export function isSafeConsultationCustomerName(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !hasUnsafeConsultationCustomerNameSyntax(value)
  );
}

export function safeConsultationCustomerName(
  value: string | null | undefined,
): string | null {
  if (!value || !isSafeConsultationCustomerName(value)) return null;
  return value.trim();
}

export function usableConsultationCustomerName(
  value: string | null | undefined,
): string | null {
  const safeName = safeConsultationCustomerName(value);
  return safeName === CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL
    ? null
    : safeName;
}

export function consultationCustomerNameForMessage(
  value: string | null | undefined,
): string {
  return usableConsultationCustomerName(value) ?? "고객";
}

export function reviewableConsultationCustomerName(
  value: string,
  maxLength: number,
): string {
  const trimmed = value.trim();
  return trimmed.length > 0 &&
    trimmed.length <= maxLength &&
    isSafeConsultationCustomerName(trimmed)
    ? trimmed
    : CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL;
}

export function safeConsultationCustomerDisplayName(
  value: string | null | undefined,
  fallback = CONSULTATION_CUSTOMER_NAME_REVIEW_LABEL,
): string {
  return safeConsultationCustomerName(value) ?? fallback;
}

export function consultationCustomerNameTextSchema(maxLength: number) {
  return z
    .string()
    .refine(
      (value) => !hasUnsafeConsultationCustomerNameSyntax(value),
      CONSULTATION_CUSTOMER_NAME_UNSAFE_MESSAGE,
    )
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "고객명을 입력해 주세요.")
        .max(maxLength, `고객명은 ${maxLength}자 이하로 입력해 주세요.`),
    );
}

export function reviewableConsultationCustomerNameTextSchema(
  maxLength: number,
) {
  return z.string().transform((value) =>
    value.trim()
      ? reviewableConsultationCustomerName(value, maxLength)
      : undefined,
  );
}

const consultationCustomerNameSuffixes = {
  none: "",
  existing: "_기존",
  referral: "_소개",
} as const satisfies Record<ConsultationCustomerNameTag, string>;

const removableConsultationCustomerNameSuffixes = [
  consultationCustomerNameSuffixes.existing,
  consultationCustomerNameSuffixes.referral,
] as const;

export function consultationCustomerNameSuffix(
  tag: ConsultationCustomerNameTag,
): string {
  return consultationCustomerNameSuffixes[tag];
}

export function stripConsultationCustomerNameSuffixes(value: string): string {
  let stripped = value;
  let removedSuffix = false;

  while (true) {
    const candidate = stripped.trimEnd();
    const suffix = removableConsultationCustomerNameSuffixes.find((item) =>
      candidate.endsWith(item),
    );
    if (!suffix) return removedSuffix ? candidate : value;
    stripped = candidate.slice(0, -suffix.length);
    removedSuffix = true;
  }
}

export function formatConsultationCustomerName(
  value: string,
  tag: ConsultationCustomerNameTag,
): string {
  const trimmed = value.trim();
  if (tag === "none") return trimmed;
  const baseName = stripConsultationCustomerNameSuffixes(trimmed).trim();
  return baseName
    ? `${baseName}${consultationCustomerNameSuffix(tag)}`
    : "";
}

export function consultationCustomerNameInputMaxLength(
  tag: ConsultationCustomerNameTag,
): number {
  return (
    CONSULTATION_CUSTOMER_NAME_MAX_LENGTH -
    consultationCustomerNameSuffix(tag).length
  );
}

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
