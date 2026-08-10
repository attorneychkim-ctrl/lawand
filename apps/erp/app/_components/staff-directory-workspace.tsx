"use client";

import { useMemo, useState } from "react";

import type { StaffDirectoryItem } from "../../lib/staff-auth";
import { CentrexLineForm } from "./centrex-line-form";
import { LegalFriendsAccountForm } from "./legalfriends-account-form";

const roleLabels: Record<StaffDirectoryItem["role"], string> = {
  admin: "관리자",
  full_time: "정규직",
  part_time: "아르바이트",
  separate_accounting: "별산",
  civil_complaint_vendor: "민원업체",
};

const attentionStatuses = new Set<StaffDirectoryItem["centrexConnection"]["status"]>([
  "incomplete",
  "pending_endpoint",
  "pending_assignment",
  "credential_pending",
  "bridge_pending",
  "bridge_provisioning",
  "bridge_failed",
  "bridge_offline",
  "mismatch",
]);

const connectingStatuses = new Set<StaffDirectoryItem["centrexConnection"]["status"]>([
  "pending_endpoint",
  "pending_assignment",
  "bridge_pending",
  "bridge_provisioning",
]);

const failedStatuses = new Set<StaffDirectoryItem["centrexConnection"]["status"]>([
  "incomplete",
  "credential_pending",
  "bridge_failed",
  "mismatch",
]);

function matchesConnectionFilter(
  member: StaffDirectoryItem,
  filter: string,
) {
  if (filter === "all") return true;
  if (filter === "attention") {
    return attentionStatuses.has(member.centrexConnection.status);
  }
  if (filter === "connecting") {
    return connectingStatuses.has(member.centrexConnection.status);
  }
  if (filter === "failed") {
    return failedStatuses.has(member.centrexConnection.status);
  }
  return member.centrexConnection.status === filter;
}

export function StaffDirectoryWorkspace({
  items,
}: {
  items: StaffDirectoryItem[];
}) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [connection, setConnection] = useState("all");
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");

  const metrics = useMemo(
    () => ({
      active: items.filter((member) => member.status === "active").length,
      connected: items.filter(
        (member) => member.centrexConnection.status === "connected",
      ).length,
      attention: items.filter((member) =>
        attentionStatuses.has(member.centrexConnection.status),
      ).length,
      legalFriends: items.filter((member) => member.legalFriendsId).length,
    }),
    [items],
  );

  const filteredItems = useMemo(
    () =>
      items.filter((member) => {
        if (region !== "all" && member.region.key !== region) return false;
        if (!matchesConnectionFilter(member, connection)) return false;
        if (!normalizedQuery) return true;
        const searchable = [
          member.displayName,
          member.email,
          member.organization.name,
          member.region.name,
          member.department,
          member.jobTitle,
          member.centrexLineNumber ?? "",
          member.centrexExtension ?? "",
          member.legalFriendsId ?? "",
          member.legalFriendsMemberIdx?.toString() ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase("ko-KR");
        return searchable.includes(normalizedQuery);
      }),
    [connection, items, normalizedQuery, region],
  );

  return (
    <>
      <div className="staff-metrics" aria-label="직원 연동 현황">
        <div>
          <span>활성 직원</span>
          <strong>{metrics.active}</strong>
        </div>
        <div>
          <span>전화 연결 정상</span>
          <strong>{metrics.connected}</strong>
        </div>
        <div className={metrics.attention ? "needs-attention" : undefined}>
          <span>연결 확인 필요</span>
          <strong>{metrics.attention}</strong>
        </div>
        <div>
          <span>리걸프렌즈 연결</span>
          <strong>{metrics.legalFriends}</strong>
        </div>
      </div>

      <div className="staff-directory-toolbar">
        <label className="staff-search-field">
          <span>직원 검색</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름, 이메일, 회선번호, 리걸프렌즈 ID"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>지역</span>
          <select
            onChange={(event) => setRegion(event.target.value)}
            value={region}
          >
            <option value="all">전체 지역</option>
            <option value="seoul">서울</option>
            <option value="daejeon">대전</option>
            <option value="busan">부산</option>
          </select>
        </label>
        <label>
          <span>전화 연결</span>
          <select
            onChange={(event) => setConnection(event.target.value)}
            value={connection}
          >
            <option value="all">전체 상태</option>
            <option value="connected">정상</option>
            <option value="connecting">연결 중</option>
            <option value="failed">연결 실패</option>
            <option value="bridge_offline">브리지 오프라인</option>
            <option value="attention">확인 필요</option>
            <option value="unconfigured">회선 미설정</option>
          </select>
        </label>
      </div>

      <p className="staff-result-count" aria-live="polite">
        전체 {items.length}명 중 {filteredItems.length}명 표시
      </p>

      <div className="staff-directory-list">
        {filteredItems.map((member) => (
          <article key={member.id} className="staff-directory-card">
            <header className="staff-directory-profile">
              <div className="staff-profile-heading">
                <div>
                  <h3>{member.displayName}</h3>
                  <p>{member.email}</p>
                </div>
                <span
                  className={`staff-account-badge ${
                    member.status === "active" ? "is-active" : "is-disabled"
                  }`}
                >
                  {member.status === "active" ? "사용 중" : "비활성"}
                </span>
              </div>
              <div className="staff-profile-facts">
                <span>{member.organization.name}</span>
                <span>{member.region.name}</span>
                <span>{member.department}</span>
                <span>{member.jobTitle}</span>
                <span>{roleLabels[member.role]}</span>
              </div>
            </header>
            <div className="staff-directory-integrations">
              <CentrexLineForm
                centrexExtension={member.centrexExtension}
                centrexLineNumber={member.centrexLineNumber}
                connection={member.centrexConnection}
                staffUserId={member.id}
              />
              <div className="staff-legalfriends-card">
                <div className="integration-form-heading">
                  <div>
                    <span className="integration-kicker">리걸프렌즈</span>
                    <strong>직원 외부 계정</strong>
                  </div>
                  <span
                    className={`connection-badge ${
                      member.legalFriendsId ? "is-connected" : "is-neutral"
                    }`}
                  >
                    {member.legalFriendsId ? "연결 완료" : "미연결"}
                  </span>
                </div>
                <LegalFriendsAccountForm
                  legalFriendsId={member.legalFriendsId}
                  legalFriendsMemberIdx={member.legalFriendsMemberIdx}
                  staffUserId={member.id}
                />
              </div>
            </div>
          </article>
        ))}
        {filteredItems.length === 0 ? (
          <div className="empty-state staff-empty-state">
            <strong>조건에 맞는 직원이 없습니다.</strong>
            <p>검색어나 필터를 바꾸면 전체 직원 목록을 다시 확인할 수 있습니다.</p>
          </div>
        ) : null}
      </div>
    </>
  );
}
