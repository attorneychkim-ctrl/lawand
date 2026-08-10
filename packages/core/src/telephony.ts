import { z } from "zod";

export const CENTREX_SMS_MAX_BYTES = 80;
export const CENTREX_LMS_MAX_BYTES = 720;
export const MMS_IMAGE_MAX_BYTES = 200 * 1024;
export const MMS_IMAGE_MAX_WIDTH = 1_500;
export const MMS_IMAGE_MAX_HEIGHT = 1_440;

export const MESSAGE_TEMPLATE_VARIABLES = [
  "{{고객명}}",
  "{{담당자명}}",
  "{{접수번호}}",
] as const;

export type MessageTemplateVariable =
  (typeof MESSAGE_TEMPLATE_VARIABLES)[number];

/**
 * 센트릭스 규격의 국내 문자 바이트 기준을 보수적으로 계산한다.
 * ASCII는 1바이트, BMP 한글·문자는 2바이트, 보조평면 문자는 4바이트다.
 */
export function centrexMessageByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0xffff ? 2 : 4;
  }
  return bytes;
}

export function centrexMessageKind(
  value: string,
): "sms" | "lms" | "too_long" {
  const bytes = centrexMessageByteLength(value);
  if (bytes <= CENTREX_SMS_MAX_BYTES) return "sms";
  if (bytes <= CENTREX_LMS_MAX_BYTES) return "lms";
  return "too_long";
}

function templateVariables(value: string): string[] {
  return value.match(/\{\{[^{}]+\}\}/g) ?? [];
}

function validateTemplateBody(
  value: string,
  context: z.RefinementCtx,
): void {
  for (const variable of templateVariables(value)) {
    if (!(MESSAGE_TEMPLATE_VARIABLES as readonly string[]).includes(variable)) {
      context.addIssue({
        code: "custom",
        message: `허용되지 않은 템플릿 변수입니다: ${variable}`,
      });
    }
  }
  if (centrexMessageByteLength(value) > CENTREX_LMS_MAX_BYTES) {
    context.addIssue({
      code: "custom",
      message: "템플릿은 센트릭스 LMS 기준 720바이트 이하여야 합니다.",
    });
  }
}

const messageTemplateNameSchema = z.string().trim().min(1).max(80);
const messageTemplateBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(CENTREX_LMS_MAX_BYTES)
  .superRefine(validateTemplateBody);

const messageTemplateImageSchema = z
  .object({
    originalName: z.string().trim().min(1).max(100),
    fileBase64: z
      .string()
      .min(4)
      .max(Math.ceil(MMS_IMAGE_MAX_BYTES / 3) * 4 + 4)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "이미지 데이터 형식이 올바르지 않습니다."),
  })
  .strict();

export const messageTemplateCreateSchema = z
  .object({
    name: messageTemplateNameSchema,
    body: messageTemplateBodySchema,
    image: messageTemplateImageSchema.nullable().optional(),
  })
  .strict();

export const messageTemplateUpdateSchema = z
  .object({
    name: messageTemplateNameSchema,
    body: messageTemplateBodySchema,
    // 생략하면 기존 이미지를 유지하고, null이면 제거하며, 객체면 교체한다.
    image: messageTemplateImageSchema.nullable().optional(),
  })
  .strict();

export const telephonyMessageSendSchema = z
  .object({
    idempotencyKey: z.uuid(),
    templateId: z.uuid().nullable(),
    body: z.string().trim().min(1).max(CENTREX_LMS_MAX_BYTES),
  })
  .strict()
  .superRefine((value, context) => {
    if (templateVariables(value.body).length > 0) {
      context.addIssue({
        code: "custom",
        message: "치환되지 않은 템플릿 변수가 남아 있습니다.",
        path: ["body"],
      });
    }
    if (centrexMessageByteLength(value.body) > CENTREX_LMS_MAX_BYTES) {
      context.addIssue({
        code: "custom",
        message: "문자 내용은 센트릭스 LMS 기준 720바이트 이하여야 합니다.",
        path: ["body"],
      });
    }
  });

export function renderMessageTemplate(
  body: string,
  values: Record<MessageTemplateVariable, string>,
): string {
  return MESSAGE_TEMPLATE_VARIABLES.reduce(
    (rendered, variable) => rendered.replaceAll(variable, values[variable]),
    body,
  );
}

export type MessageTemplateCreate = z.infer<
  typeof messageTemplateCreateSchema
>;
export type MessageTemplateUpdate = z.infer<
  typeof messageTemplateUpdateSchema
>;
export type TelephonyMessageSend = z.infer<
  typeof telephonyMessageSendSchema
>;

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

export const legalFriendsDirectoryClickToCallSchema = z
  .object({
    clientIdx: z.number().int().positive(),
    caseIdx: z.number().int().positive(),
  })
  .strict();

export const legalFriendsDirectoryMessageSendSchema = z
  .object({
    clientIdx: z.number().int().positive(),
    caseIdx: z.number().int().positive(),
    idempotencyKey: z.uuid(),
    templateId: z.uuid().nullable(),
    body: z.string().trim().min(1).max(CENTREX_LMS_MAX_BYTES),
  })
  .strict()
  .superRefine((value, context) => {
    if (templateVariables(value.body).length > 0) {
      context.addIssue({
        code: "custom",
        message: "치환되지 않은 템플릿 변수가 남아 있습니다.",
        path: ["body"],
      });
    }
    if (centrexMessageByteLength(value.body) > CENTREX_LMS_MAX_BYTES) {
      context.addIssue({
        code: "custom",
        message: "문자 내용은 센트릭스 LMS 기준 720바이트 이하여야 합니다.",
        path: ["body"],
      });
    }
  });

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
