import { sql, type SQL } from "drizzle-orm";

function candidateValues(phones: readonly string[]): SQL {
  if (phones.length === 0) {
    throw new Error("전화번호 일괄조회에는 한 개 이상의 번호가 필요합니다.");
  }
  return sql.join(
    phones.map((phone) => sql`(${phone})`),
    sql.raw(", "),
  );
}

export type ConsultationPhoneDirectoryCandidate = {
  consultationId: string;
  phone: string;
  ownCaseIdx: string | null;
};

function consultationCandidateValues(
  candidates: readonly ConsultationPhoneDirectoryCandidate[],
): SQL {
  if (candidates.length === 0) {
    throw new Error("상담별 전화번호 일괄조회에는 한 개 이상의 후보가 필요합니다.");
  }
  return sql.join(
    candidates.map(
      (candidate) =>
        sql`(${candidate.consultationId}::uuid, ${candidate.phone}::text, ${candidate.ownCaseIdx}::text)`,
    ),
    sql.raw(", "),
  );
}

export function excludeOwnLegalFriendsCase<T extends { caseIdx: number }>(
  matches: readonly T[],
  ownCaseIdx: string | null,
): T[] {
  const normalizedOwnCaseIdx = ownCaseIdx?.trim() || null;
  if (!normalizedOwnCaseIdx) return [...matches];
  return matches.filter(
    (match) => String(match.caseIdx) !== normalizedOwnCaseIdx,
  );
}

export function existingPhoneDirectoryCustomersQuery(
  phones: readonly string[],
) {
  return sql<{ candidate_phone: string }>`
    with candidate(phone) as (
      values ${candidateValues(phones)}
    )
    select candidate.phone as candidate_phone
    from candidate
    where exists (
      select 1
      from public.resolve_inbound_phone_directory(candidate.phone)
    )
  `;
}

export function existingConsultationPhoneDirectoryCustomersQuery(
  candidates: readonly ConsultationPhoneDirectoryCandidate[],
) {
  return sql<{ consultation_id: string }>`
    with candidate(consultation_id, phone, own_case_idx) as (
      values ${consultationCandidateValues(candidates)}
    )
    select candidate.consultation_id
    from candidate
    where exists (
      select 1
      from public.resolve_inbound_phone_directory(candidate.phone) as directory
      where candidate.own_case_idx is null
        or directory.case_idx::text <> candidate.own_case_idx
    )
  `;
}

export function phoneDirectoryCustomersQuery(phones: readonly string[]) {
  return sql`
    with candidate(phone) as (
      values ${candidateValues(phones)}
    )
    select candidate.phone as candidate_phone, directory.*
    from candidate
    cross join lateral
      public.resolve_inbound_phone_directory(candidate.phone) as directory
  `;
}
