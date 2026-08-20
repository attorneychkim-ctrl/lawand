export type ConsultationFollowUpRequest = {
  id: string;
  source: string;
  contactChannel: "phone" | "kakao_channel" | "naver_booking";
  contactPreference: "as_soon_as_possible" | "scheduled_window";
  contactWindowStart: Date | null;
  contactWindowEnd: Date | null;
};

export function consultationScheduleFollowUp(
  request: ConsultationFollowUpRequest | undefined,
) {
  if (
    request?.source !== "homepage" ||
    request.contactChannel !== "phone" ||
    request.contactPreference !== "scheduled_window" ||
    !request.contactWindowStart ||
    !request.contactWindowEnd
  ) {
    return null;
  }
  return {
    consultationRequestId: request.id,
    dueAt: request.contactWindowStart,
    windowEndAt: request.contactWindowEnd,
  };
}
