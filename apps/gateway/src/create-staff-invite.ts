import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { staffInvitationCreationSchema } from "@lawand/core";
import { createDatabaseClient } from "@lawand/db";

import { createStaffAuthService } from "./auth.js";

const localEnvPath = resolve(process.cwd(), ".env.local");
if (existsSync(localEnvPath)) {
  process.loadEnvFile(localEnvPath);
}

const email = process.argv[2];
const name = process.argv[3];
const organization = process.argv[4];
const region = process.argv[5];
const department = process.argv[6];
const jobTitle = process.argv[7];
const erpBaseUrl = process.env.LAWAND_ERP_BASE_URL ?? "http://127.0.0.1:3021";
const databaseUrl = process.env.LAWAND_APP_DATABASE_URL;

if (
  !email ||
  !name ||
  !organization ||
  !region ||
  !department ||
  !jobTitle ||
  !databaseUrl
) {
  throw new Error(
    '사용법: pnpm staff:bootstrap <이메일> "<이름>" <lawand|legalflow> <seoul|daejeon|busan> "<부서>" "<직책>"',
  );
}

const input = staffInvitationCreationSchema.parse({
  email,
  name,
  organization,
  region,
  department,
  jobTitle,
  role: "admin",
});
const database = createDatabaseClient(databaseUrl);

try {
  const auth = createStaffAuthService({ db: database.db });
  const invitation = await auth.createBootstrapInvitation(input);
  console.log("최초 관리자 초대가 생성되었습니다.");
  console.log(
    `${erpBaseUrl.replace(/\/$/, "")}/invitations/${invitation.token}`,
  );
  console.log(`만료: ${invitation.expiresAt}`);
} finally {
  await database.pool.end();
}
