import { z } from "zod";

export const telephonyCallDispositionSchema = z.enum([
  "customer_conversation",
  "voicemail",
  "no_answer",
  "rejected",
  "busy",
  "caller_cancelled",
  "callback_required",
]);

export const telephonyCallDispositionConfirmationSchema = z
  .object({
    disposition: telephonyCallDispositionSchema,
  })
  .strict();

export type TelephonyCallDisposition = z.infer<
  typeof telephonyCallDispositionSchema
>;

export const phoneDeskCallResultSchema = z.enum([
  "consultation_completed",
  "reconsultation_required",
  "no_answer",
  "busy",
  "manager_callback_requested",
  "rejected",
  "public_institution",
  "creditor",
  "wrong_number",
  "other",
]);

const phoneDeskConsultationActionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }).strict(),
  z
    .object({
      mode: z.literal("link"),
      consultationId: z.uuid(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("create"),
      customerName: z.string().trim().min(1).max(50),
      assigneeUserId: z.uuid().optional(),
    })
    .strict(),
]);

const phoneDeskFollowUpSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }).strict(),
  z
    .object({
      enabled: z.literal(true),
      dueAt: z.iso.datetime({ offset: true }),
      assigneeUserId: z.uuid(),
    })
    .strict(),
]);

export const phoneDeskAftercareSaveSchema = z
  .object({
    result: phoneDeskCallResultSchema,
    otherText: z.string().trim().max(500).optional(),
    memo: z.string().trim().max(2_000).optional(),
    consultation: phoneDeskConsultationActionSchema,
    followUp: phoneDeskFollowUpSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.result === "other" && !value.otherText) {
      context.addIssue({
        code: "custom",
        message: "기타 통화 결과의 내용을 입력해 주세요.",
        path: ["otherText"],
      });
    }
    if (value.result !== "other" && value.otherText) {
      context.addIssue({
        code: "custom",
        message: "기타 결과를 선택했을 때만 기타 내용을 입력할 수 있습니다.",
        path: ["otherText"],
      });
    }
  });

export const phoneDeskFollowUpCompletionSchema = z
  .object({
    completed: z.literal(true),
  })
  .strict();

export type PhoneDeskCallResult = z.infer<
  typeof phoneDeskCallResultSchema
>;
export type PhoneDeskAftercareSave = z.infer<
  typeof phoneDeskAftercareSaveSchema
>;

const bridgeIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$/);
const providerCallIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/);
const phoneDigitsSchema = z.string().regex(/^[0-9]{8,20}$/);

const centrexBridgeEventEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: z.uuid(),
    bridgeId: bridgeIdSchema,
    endpointId: z.uuid(),
    occurredAt: z.iso.datetime({ offset: true }),
    providerCallId: providerCallIdSchema,
  })
  .strict();

export const centrexBridgeRingingEventSchema =
  centrexBridgeEventEnvelopeSchema
    .extend({
      eventType: z.literal("inbound.ringing"),
      callerNumber: phoneDigitsSchema,
      incomingLineNumber: phoneDigitsSchema,
    })
    .strict();

export const centrexBridgeConnectedEventSchema =
  centrexBridgeEventEnvelopeSchema
    .extend({
      eventType: z.literal("inbound.connected"),
      providerChannelId: providerCallIdSchema.optional(),
    })
    .strict();

export const centrexBridgeEndedEventSchema = centrexBridgeEventEnvelopeSchema
  .extend({
    eventType: z.literal("inbound.ended"),
    providerEndCause: z.string().regex(/^[A-Za-z0-9_.:-]{1,30}$/),
  })
  .strict();

export const centrexBridgeOutboundRingingEventSchema =
  centrexBridgeEventEnvelopeSchema
    .extend({
      eventType: z.literal("outbound.ringing"),
      calledNumber: phoneDigitsSchema,
    })
    .strict();

export const centrexBridgeOutboundConnectedEventSchema =
  centrexBridgeEventEnvelopeSchema
    .extend({
      eventType: z.literal("outbound.connected"),
      providerChannelId: providerCallIdSchema.optional(),
    })
    .strict();

export const centrexBridgeOutboundEndedEventSchema =
  centrexBridgeEventEnvelopeSchema
    .extend({
      eventType: z.literal("outbound.ended"),
      providerEndCause: z.string().regex(/^[A-Za-z0-9_.:-]{1,30}$/),
    })
    .strict();

export const centrexBridgeEventSchema = z.discriminatedUnion("eventType", [
  centrexBridgeRingingEventSchema,
  centrexBridgeConnectedEventSchema,
  centrexBridgeEndedEventSchema,
  centrexBridgeOutboundRingingEventSchema,
  centrexBridgeOutboundConnectedEventSchema,
  centrexBridgeOutboundEndedEventSchema,
]);

export type CentrexBridgeEvent = z.infer<typeof centrexBridgeEventSchema>;

export const centrexBridgeAnswerCommandSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.uuid(),
    inboundCallId: z.uuid(),
    commandType: z.literal("answer"),
    expectedProviderCallId: providerCallIdSchema,
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const centrexBridgeProvisionCommandSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.uuid(),
    commandType: z.literal("provision"),
    endpointId: z.uuid(),
    expectedExtension: z.string().regex(/^[0-9]{2,10}$/),
    expectedLineLast4: z.string().regex(/^[0-9]{4}$/),
    credentialEnvelope: z
      .object({
        algorithm: z.literal("A256CBC-HS256"),
        iv: base64UrlSchema,
        ciphertext: base64UrlSchema,
        mac: base64UrlSchema,
      })
      .strict(),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const centrexBridgeResetCommandSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.uuid(),
    commandType: z.literal("reset"),
    endpointId: z.uuid(),
    expectedExtension: z.literal("0000"),
    expectedLineLast4: z.literal("0000"),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const centrexBridgeCommandSchema = z.discriminatedUnion(
  "commandType",
  [
    centrexBridgeAnswerCommandSchema,
    centrexBridgeProvisionCommandSchema,
    centrexBridgeResetCommandSchema,
  ],
);

export const centrexBridgeCommandResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.uuid(),
    status: z.enum(["succeeded", "failed"]),
    resultCode: z.string().regex(/^[A-Za-z0-9_.:-]{1,60}$/),
  })
  .strict();

export type CentrexBridgeAnswerCommand = z.infer<
  typeof centrexBridgeAnswerCommandSchema
>;
export type CentrexBridgeProvisionCommand = z.infer<
  typeof centrexBridgeProvisionCommandSchema
>;
export type CentrexBridgeResetCommand = z.infer<
  typeof centrexBridgeResetCommandSchema
>;
export type CentrexBridgeCommand = z.infer<
  typeof centrexBridgeCommandSchema
>;
export type CentrexBridgeCommandResult = z.infer<
  typeof centrexBridgeCommandResultSchema
>;
