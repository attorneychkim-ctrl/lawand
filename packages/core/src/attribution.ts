import { z } from "zod";

const optionalTrackingValue = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).optional();

const internalPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^\/(?!\/)/, "사이트 내부 절대 경로만 허용합니다.");

export const attributionSourceSchema = z
  .object({
    adpilotClickId: optionalTrackingValue(200),
    platformClickId: optionalTrackingValue(200),
    utmSource: optionalTrackingValue(100),
    utmMedium: optionalTrackingValue(100),
    utmCampaign: optionalTrackingValue(200),
    utmTerm: optionalTrackingValue(200),
    utmContent: optionalTrackingValue(200),
    externalCampaignId: optionalTrackingValue(100),
    externalAdGroupId: optionalTrackingValue(100),
    externalKeywordId: optionalTrackingValue(100),
    externalCreativeId: optionalTrackingValue(100),
    matchedKeyword: optionalTrackingValue(200),
    matchType: z.enum(["exact", "phrase", "broad", "unknown"]).optional(),
  })
  .strict();

export const journeyEntrySchema = z
  .object({
    path: internalPathSchema,
    visitedAt: z.iso.datetime({ offset: true }),
    pageKey: optionalTrackingValue(100),
    pageVersion: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

export const consultationCtaSchema = z
  .object({
    path: internalPathSchema,
    placement: z.string().trim().min(1).max(100),
    clickedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const consultationAttributionInputSchema = z
  .object({
    journeySessionId: z.uuid(),
    startedAt: z.iso.datetime({ offset: true }),
    firstLandingPath: internalPathSchema,
    referrerHost: z.string().trim().min(1).max(253).optional(),
    source: attributionSourceSchema,
    journey: z.array(journeyEntrySchema).max(20),
    consultationCta: consultationCtaSchema.optional(),
    submittedFromPath: internalPathSchema,
  })
  .strict();

export type AttributionSource = z.infer<typeof attributionSourceSchema>;
export type ConsultationAttributionInput = z.infer<
  typeof consultationAttributionInputSchema
>;
