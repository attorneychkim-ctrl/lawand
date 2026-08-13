import { z } from "zod";

import { consultationModeSchema } from "./consultation.js";

export const LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID =
  "lawandfirm_s999" as const;
export const LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX = 1824 as const;

const eventEnvelopeSchema = z
  .object({
    eventId: z.uuid(),
    eventVersion: z.literal(1),
    occurredAt: z.iso.datetime({ offset: true }),
    producer: z.literal("lawand.gateway"),
    correlationId: z.uuid(),
    causationId: z.uuid().optional(),
  })
  .strict();

const requestedDataSchema = z
  .object({
    consultationId: z.uuid(),
    requestId: z.uuid(),
    intakeRef: z.string().regex(/^consultation_requests\/[0-9a-f-]{36}$/),
    attributionRef: z
      .string()
      .regex(/^consultation_attributions\/[0-9a-f-]{36}$/)
      .optional(),
    mode: consultationModeSchema,
    privacyNoticeVersion: z.string().trim().min(1).max(50),
    privacyBasis: z.enum([
      "explicit_consent",
      "customer_initiated_channel_message",
      "customer_initiated_channel_entry",
      "customer_initiated_booking",
      "staff_recorded_phone_interaction",
    ]),
    consentAgreedAt: z.iso.datetime({ offset: true }).optional(),
    dedupeOutcome: z.enum(["new", "suspected_duplicate"]),
  })
  .strict()
  .superRefine((value, context) => {
    const hasConsent = Boolean(value.consentAgreedAt);
    if (
      (value.privacyBasis === "explicit_consent" && !hasConsent) ||
      (value.privacyBasis !== "explicit_consent" && hasConsent)
    ) {
      context.addIssue({
        code: "custom",
        message: "개인정보 처리 근거와 동의 시각이 일치하지 않습니다.",
        path: ["consentAgreedAt"],
      });
    }
  });

const updatedReferenceFields = {
  consultationId: z.uuid(),
  requestId: z.uuid(),
  intakeRef: z.string().regex(/^consultation_requests\/[0-9a-f-]{36}$/),
  attributionRef: z
    .string()
    .regex(/^consultation_attributions\/[0-9a-f-]{36}$/)
    .optional(),
};

const updatedDataSchema = z.discriminatedUnion("updateReason", [
  z
    .object({
      ...updatedReferenceFields,
      updateReason: z.literal("identity_enriched"),
      dedupeOutcome: z.literal("identity_enrichment"),
    })
    .strict(),
  z
    .object({
      ...updatedReferenceFields,
      updateReason: z.literal("repeat_request"),
      repeatStage: z.enum(["before_assignment", "after_assignment"]),
      dedupeOutcome: z.enum(["repeat_unassigned", "repeat_assigned"]),
    })
    .strict(),
]);

const duplicateSuspectedDataSchema = z
  .object({
    consultationId: z.uuid(),
    requestId: z.uuid(),
    candidateConsultationId: z.uuid(),
    reason: z.literal("same_phone_within_7_days"),
    dedupeOutcome: z.literal("suspected_duplicate"),
  })
  .strict();

const softDeletedDataSchema = z
  .object({
    consultationId: z.uuid(),
    deletedByUserId: z.uuid(),
    deletionKind: z.literal("staff_manual_soft_delete"),
  })
  .strict();

const assignmentReferenceDataSchema = z
  .object({
    consultationId: z.uuid(),
    requestId: z.uuid(),
    assignmentId: z.uuid(),
    assignmentRef: z
      .string()
      .regex(/^consultation_assignments\/[0-9a-f-]{36}$/),
    intakeRef: z.string().regex(/^consultation_requests\/[0-9a-f-]{36}$/),
  })
  .strict();

const invalidManagerRegistrationReferenceDataSchema = z
  .object({
    consultationId: z.uuid(),
    requestId: z.uuid(),
    intakeRef: z.string().regex(/^consultation_requests\/[0-9a-f-]{36}$/),
    registrationTarget: z.literal("invalid_manager"),
    requestedByUserId: z.uuid(),
    targetManagerExternalAccountId: z.literal(
      LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
    ),
    targetManagerMemberIdx: z.literal(
      LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
    ),
  })
  .strict();

const legalFriendsInvalidationReferenceDataSchema = z
  .object({
    consultationId: z.uuid(),
    caseLinkRef: z
      .string()
      .regex(/^legalfriends_case_links\/[0-9a-f-]{36}$/),
    requestedByUserId: z.uuid(),
    targetManagerExternalAccountId: z.literal(
      LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
    ),
    targetManagerMemberIdx: z.literal(
      LEGALFRIENDS_INVALID_MANAGER_MEMBER_IDX,
    ),
  })
  .strict();

const requestReferenceDataSchema = z
  .object({
    consultationId: z.uuid(),
    requestId: z.uuid(),
    intakeRef: z.string().regex(/^consultation_requests\/[0-9a-f-]{36}$/),
  })
  .strict();

const kakaoHomepageEntryReferenceDataSchema = requestReferenceDataSchema
  .extend({
    entryId: z.uuid(),
    actorUserId: z.uuid(),
  })
  .strict();

const consultationTelephonyCallReferenceDataSchema = z
  .object({
    callId: z.uuid(),
    targetSource: z.literal("consultation").optional(),
    consultationId: z.uuid(),
    requestId: z.uuid(),
    endpointId: z.uuid(),
    staffUserId: z.uuid(),
    provider: z.literal("centrex"),
    direction: z.literal("outbound"),
    command: z.literal("clickdial"),
  })
  .strict();

const legalFriendsDirectoryTelephonyCallReferenceDataSchema = z
  .object({
    callId: z.uuid(),
    targetSource: z.literal("legal_friends_directory"),
    directoryClientIdx: z.number().int().positive(),
    directoryCaseIdx: z.number().int().positive(),
    endpointId: z.uuid(),
    staffUserId: z.uuid(),
    provider: z.literal("centrex"),
    direction: z.literal("outbound"),
    command: z.literal("clickdial"),
  })
  .strict();

const telephonyCallReferenceDataSchema = z.union([
  consultationTelephonyCallReferenceDataSchema,
  legalFriendsDirectoryTelephonyCallReferenceDataSchema,
]);

const telephonyMessageReferenceFields = {
  messageId: z.uuid(),
  endpointId: z.uuid(),
  staffUserId: z.uuid(),
  contentRef: z
    .string()
    .regex(/^telephony_messages\/[0-9a-f-]{36}\/body$/),
};

const consultationTelephonyMessageReferenceFields = {
  ...telephonyMessageReferenceFields,
  targetSource: z.literal("consultation").optional(),
  consultationId: z.uuid(),
  requestId: z.uuid(),
};

const legalFriendsDirectoryTelephonyMessageReferenceFields = {
  ...telephonyMessageReferenceFields,
  targetSource: z.literal("legal_friends_directory"),
  directoryClientIdx: z.number().int().positive(),
  directoryCaseIdx: z.number().int().positive(),
};

const telephonyMessageReferenceDataSchema = z.union([
  z
    .object({
      ...consultationTelephonyMessageReferenceFields,
      provider: z.literal("centrex"),
      channel: z.literal("sms"),
      command: z.literal("smssend"),
    })
    .strict(),
  z
    .object({
      ...consultationTelephonyMessageReferenceFields,
      provider: z.literal("solapi"),
      channel: z.literal("mms"),
      command: z.literal("send-many"),
    })
    .strict(),
  z
    .object({
      ...legalFriendsDirectoryTelephonyMessageReferenceFields,
      provider: z.literal("centrex"),
      channel: z.literal("sms"),
      command: z.literal("smssend"),
    })
    .strict(),
  z
    .object({
      ...legalFriendsDirectoryTelephonyMessageReferenceFields,
      provider: z.literal("solapi"),
      channel: z.literal("mms"),
      command: z.literal("send-many"),
    })
    .strict(),
]);

const assignedDataSchema = assignmentReferenceDataSchema
  .extend({
    assigneeUserId: z.uuid(),
    assigneeMembershipId: z.uuid(),
    assignmentMethod: z.literal("self_claim"),
  })
  .strict();

export const consultationRequestedEventSchema = eventEnvelopeSchema
  .extend({
    eventType: z.literal("consultation.requested"),
    data: requestedDataSchema,
  })
  .strict();

export const consultationRequestUpdatedEventSchema = eventEnvelopeSchema
  .extend({
    eventType: z.literal("consultation.request.updated"),
    data: updatedDataSchema,
  })
  .strict();

export const consultationDuplicateSuspectedEventSchema = eventEnvelopeSchema
  .extend({
    eventType: z.literal("consultation.duplicate_suspected"),
    data: duplicateSuspectedDataSchema,
  })
  .strict();

export const consultationSoftDeletedEventSchema = eventEnvelopeSchema
  .extend({
    eventType: z.literal("consultation.soft_deleted"),
    data: softDeletedDataSchema,
  })
  .strict();

export const consultationAssignedEventSchema = eventEnvelopeSchema
  .extend({
    eventType: z.literal("consultation.assigned"),
    data: assignedDataSchema,
  })
  .strict();

export const consultationKakaoChatConfirmedEventSchema =
  eventEnvelopeSchema
    .extend({
      eventType: z.literal("consultation.kakao_chat.confirmed"),
      data: kakaoHomepageEntryReferenceDataSchema,
    })
    .strict();

export const consultationKakaoEntryInvalidatedEventSchema =
  eventEnvelopeSchema
    .extend({
      eventType: z.literal("consultation.kakao_entry.invalidated"),
      data: kakaoHomepageEntryReferenceDataSchema,
    })
    .strict();

export const legalfriendsRegistrationRequestedEventSchema =
  eventEnvelopeSchema
    .extend({
      eventType: z.literal(
        "legalfriends.consultation.registration.requested",
      ),
      data: z.union([
        assignmentReferenceDataSchema,
        invalidManagerRegistrationReferenceDataSchema,
      ]),
    })
    .strict();

export const legalfriendsInvalidationRequestedEventSchema =
  eventEnvelopeSchema
    .extend({
      eventType: z.literal(
        "legalfriends.consultation.invalidation.requested",
      ),
      data: legalFriendsInvalidationReferenceDataSchema,
    })
    .strict();

export const telephonyCallRequestedEventSchema = eventEnvelopeSchema
  .extend({
    eventType: z.literal("telephony.call.requested"),
    data: telephonyCallReferenceDataSchema,
  })
  .strict();

export const telephonyMessageRequestedEventSchema = eventEnvelopeSchema
  .extend({
    eventType: z.literal("telephony.message.requested"),
    data: telephonyMessageReferenceDataSchema,
  })
  .strict();

export const alimtalkRequestNotificationRequestedEventSchema =
  eventEnvelopeSchema
    .extend({
      eventType: z.literal(
        "alimtalk.consultation.request_notification.requested",
      ),
      data: requestReferenceDataSchema.extend({
        templatePurpose: z.literal("consultation_requested"),
      }),
    })
    .strict();

export const alimtalkAssignmentNotificationRequestedEventSchema =
  eventEnvelopeSchema
    .extend({
      eventType: z.literal(
        "alimtalk.consultation.assignment_notification.requested",
      ),
      data: assignmentReferenceDataSchema.extend({
        templatePurpose: z.literal("consultation_assigned"),
      }),
    })
    .strict();

export const platformEventSchema = z.discriminatedUnion("eventType", [
  consultationRequestedEventSchema,
  consultationRequestUpdatedEventSchema,
  consultationDuplicateSuspectedEventSchema,
  consultationSoftDeletedEventSchema,
  consultationAssignedEventSchema,
  consultationKakaoChatConfirmedEventSchema,
  consultationKakaoEntryInvalidatedEventSchema,
  telephonyCallRequestedEventSchema,
  telephonyMessageRequestedEventSchema,
  legalfriendsRegistrationRequestedEventSchema,
  legalfriendsInvalidationRequestedEventSchema,
  alimtalkRequestNotificationRequestedEventSchema,
  alimtalkAssignmentNotificationRequestedEventSchema,
]);

export type ConsultationRequestedEvent = z.infer<
  typeof consultationRequestedEventSchema
>;
export type ConsultationRequestUpdatedEvent = z.infer<
  typeof consultationRequestUpdatedEventSchema
>;
export type ConsultationDuplicateSuspectedEvent = z.infer<
  typeof consultationDuplicateSuspectedEventSchema
>;
export type ConsultationSoftDeletedEvent = z.infer<
  typeof consultationSoftDeletedEventSchema
>;
export type ConsultationAssignedEvent = z.infer<
  typeof consultationAssignedEventSchema
>;
export type ConsultationKakaoChatConfirmedEvent = z.infer<
  typeof consultationKakaoChatConfirmedEventSchema
>;
export type ConsultationKakaoEntryInvalidatedEvent = z.infer<
  typeof consultationKakaoEntryInvalidatedEventSchema
>;
export type LegalfriendsRegistrationRequestedEvent = z.infer<
  typeof legalfriendsRegistrationRequestedEventSchema
>;
export type LegalFriendsInvalidationRequestedEvent = z.infer<
  typeof legalfriendsInvalidationRequestedEventSchema
>;
export type TelephonyCallRequestedEvent = z.infer<
  typeof telephonyCallRequestedEventSchema
>;
export type TelephonyMessageRequestedEvent = z.infer<
  typeof telephonyMessageRequestedEventSchema
>;
export type AlimtalkRequestNotificationRequestedEvent = z.infer<
  typeof alimtalkRequestNotificationRequestedEventSchema
>;
export type AlimtalkAssignmentNotificationRequestedEvent = z.infer<
  typeof alimtalkAssignmentNotificationRequestedEventSchema
>;
export type PlatformEvent = z.infer<typeof platformEventSchema>;
export type ConsultationEvent = PlatformEvent;

export function assertPlatformEvent(
  value: unknown,
): asserts value is PlatformEvent {
  platformEventSchema.parse(value);
}

export const consultationEventSchema = platformEventSchema;
export const assertConsultationEvent = assertPlatformEvent;
