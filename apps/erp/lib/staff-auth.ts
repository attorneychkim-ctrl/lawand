import "server-only";

export type StaffRole =
  | "admin"
  | "full_time"
  | "part_time"
  | "separate_accounting"
  | "civil_complaint_vendor";

export type StaffMembership = {
  id: string;
  organization: { key: string; name: string };
  region: { key: string; name: string };
  department: string;
  jobTitle: string;
  role: StaffRole;
  isPrimary: boolean;
};

export type StaffPrincipal = {
  id: string;
  email: string;
  displayName: string;
  primaryMembership: StaffMembership;
  memberships: StaffMembership[];
  roles: StaffRole[];
};

export type StaffSessionResult = {
  staff: StaffPrincipal;
  sessionToken: string;
  expiresAt: string;
};

export type StaffInvitation = {
  email: string;
  displayName: string;
  organization: { key: string; name: string };
  region: { key: string; name: string };
  department: string;
  jobTitle: string;
  role: StaffRole;
  centrexLineNumber: string | null;
  centrexExtension: string | null;
  legalFriendsId: string | null;
  legalFriendsMemberIdx: number | null;
  expiresAt: string;
};

export type StaffDirectoryItem = {
  id: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
  organization: { key: string; name: string };
  region: { key: string; name: string };
  department: string;
  jobTitle: string;
  role: StaffRole;
  centrexLineNumber: string | null;
  centrexExtension: string | null;
  centrexConnection: {
    status:
      | "unconfigured"
      | "incomplete"
      | "pending_endpoint"
      | "pending_assignment"
      | "credential_pending"
      | "bridge_pending"
      | "bridge_provisioning"
      | "bridge_failed"
      | "bridge_offline"
      | "connected"
      | "mismatch";
    assignedEndpoint: {
      id: string;
      label: string;
      lineNumber: string;
      extension: string;
      credentialConfigured: boolean;
      bridgeConfigured: boolean;
      bridgeOnline: boolean;
      bridgeState: string | null;
      bridgeLastSeenAt: string | null;
      lastAuthSucceededAt: string | null;
    } | null;
  };
  legalFriendsId: string | null;
  legalFriendsMemberIdx: number | null;
};

const gatewayUrl =
  process.env.LAWAND_GATEWAY_URL ?? "http://127.0.0.1:3022";

function internalKey(): string {
  const value = process.env.LAWAND_INTERNAL_API_KEY;
  if (!value) {
    throw new Error("LAWAND_INTERNAL_API_KEY가 설정되지 않았습니다.");
  }
  return value;
}

export class StaffGatewayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function authFetch(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    sessionToken?: string;
  } = {},
) {
  const response = await fetch(`${gatewayUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "x-lawand-internal-key": internalKey(),
      ...(options.sessionToken
        ? { "x-lawand-staff-session": options.sessionToken }
        : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
      issues?: Array<{ message?: string }>;
    } | null;
    throw new StaffGatewayError(
      response.status,
      body?.error ?? "gateway_error",
      body?.message ??
        body?.issues?.[0]?.message ??
        "인증 요청을 처리하지 못했습니다.",
    );
  }
  return response;
}

export async function loginStaff(input: {
  email: string;
  password: string;
}): Promise<StaffSessionResult> {
  const response = await authFetch("/v1/staff-auth/login", {
    method: "POST",
    body: input,
  });
  return (await response.json()) as StaffSessionResult;
}

export async function fetchStaffSession(
  sessionToken: string,
): Promise<StaffPrincipal> {
  const response = await authFetch("/v1/staff-auth/session", {
    sessionToken,
  });
  const body = (await response.json()) as { staff: StaffPrincipal };
  return body.staff;
}

export async function logoutStaff(sessionToken: string): Promise<void> {
  await authFetch("/v1/staff-auth/logout", {
    method: "POST",
    sessionToken,
  });
}

export async function inspectStaffInvitation(
  token: string,
): Promise<StaffInvitation> {
  const response = await authFetch("/v1/staff-auth/invitations/inspect", {
    method: "POST",
    body: { token },
  });
  const body = (await response.json()) as {
    invitation: StaffInvitation;
  };
  return body.invitation;
}

export async function acceptStaffInvitation(input: {
  token: string;
  password: string;
}): Promise<StaffSessionResult> {
  const response = await authFetch("/v1/staff-auth/invitations/accept", {
    method: "POST",
    body: input,
  });
  return (await response.json()) as StaffSessionResult;
}

export async function createStaffInvitation(
  sessionToken: string,
  input: {
    email: string;
    name: string;
    organization: "lawand" | "legalflow";
    region: "seoul" | "daejeon" | "busan";
    department: string;
    jobTitle: string;
    role: StaffRole;
    centrexLineNumber?: string;
    centrexExtension?: string;
    legalFriendsId?: string;
    legalFriendsMemberIdx?: number;
  },
): Promise<StaffInvitation & { token: string }> {
  const response = await authFetch("/v1/staff-auth/invitations", {
    method: "POST",
    body: input,
    sessionToken,
  });
  const body = (await response.json()) as {
    invitation: StaffInvitation & { token: string };
  };
  return body.invitation;
}

export async function getStaffDirectory(
  sessionToken: string,
): Promise<StaffDirectoryItem[]> {
  const response = await authFetch("/v1/staff-auth/users", {
    sessionToken,
  });
  const body = (await response.json()) as { items: StaffDirectoryItem[] };
  return body.items;
}

export async function updateStaffLegalFriendsAccount(
  sessionToken: string,
  staffUserId: string,
  legalFriendsId: string | null,
  legalFriendsMemberIdx: number | null,
): Promise<void> {
  await authFetch(
    `/v1/staff-auth/users/${staffUserId}/legalfriends-account`,
    {
      method: "POST",
      body: { legalFriendsId, legalFriendsMemberIdx },
      sessionToken,
    },
  );
}

export async function updateStaffCentrexLineNumber(
  sessionToken: string,
  staffUserId: string,
  centrexLineNumber: string | null,
  centrexExtension: string | null,
  centrexPassword: string | null,
): Promise<{ credentialUpdated: boolean; bridgeConnected: boolean }> {
  const response = await authFetch(
    `/v1/staff-auth/users/${staffUserId}/centrex-line`,
    {
      method: "POST",
      body: { centrexLineNumber, centrexExtension, centrexPassword },
      sessionToken,
    },
  );
  return (await response.json()) as {
    credentialUpdated: boolean;
    bridgeConnected: boolean;
  };
}

export async function reassignStaffCentrexBridge(
  sessionToken: string,
  staffUserId: string,
): Promise<void> {
  await authFetch(
    `/v1/staff-auth/users/${staffUserId}/centrex-bridge-reassign`,
    {
      method: "POST",
      sessionToken,
    },
  );
}
