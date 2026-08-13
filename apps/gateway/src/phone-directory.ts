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
