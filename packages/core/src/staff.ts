import { z } from "zod";

const normalizedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("올바른 이메일 주소를 입력해 주세요.")
  .max(254);

export const staffRoleSchema = z.enum([
  "admin",
  "full_time",
  "part_time",
  "separate_accounting",
  "civil_complaint_vendor",
]);

export const staffOrganizationSchema = z.enum(["lawand", "legalflow"]);

export const staffRegionSchema = z.enum(["seoul", "daejeon", "busan"]);

export const legalFriendsAccountIdSchema = z
  .string()
  .trim()
  .min(1, "리걸프렌즈 아이디를 입력해 주세요.")
  .max(100, "리걸프렌즈 아이디는 100자 이하여야 합니다.")
  .regex(/^\S+$/, "리걸프렌즈 아이디에는 공백을 넣을 수 없습니다.");

export const legalFriendsMemberIdxSchema = z
  .number()
  .int("리걸프렌즈 member_idx는 정수여야 합니다.")
  .positive("리걸프렌즈 member_idx는 1 이상이어야 합니다.")
  .max(2_147_483_647, "리걸프렌즈 member_idx가 허용 범위를 벗어났습니다.");

export const centrexLineNumberSchema = z
  .string()
  .trim()
  .transform((value) => value.replaceAll("-", ""))
  .pipe(
    z
      .string()
      .regex(
        /^070[0-9]{8}$/,
        "센트릭스 회선번호는 070으로 시작하는 전체 11자리 번호여야 합니다.",
      ),
  );

export const centrexExtensionSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9]{2,10}$/,
    "센트릭스 내선번호는 숫자 2~10자리여야 합니다.",
  );

export const centrexPasswordSchema = z
  .string()
  .min(1, "센트릭스 비밀번호를 입력해 주세요.")
  .max(128, "센트릭스 비밀번호는 128자 이하여야 합니다.")
  .refine(
    (value) =>
      Array.from(value).every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint > 31 && codePoint !== 127;
      }),
    "센트릭스 비밀번호에 제어 문자를 사용할 수 없습니다.",
  );

function requireCentrexPair(
  value: {
    centrexLineNumber?: string | null | undefined;
    centrexExtension?: string | null | undefined;
  },
  context: z.RefinementCtx,
) {
  if (Boolean(value.centrexLineNumber) === Boolean(value.centrexExtension)) {
    return;
  }
  context.addIssue({
    code: "custom",
    path: value.centrexLineNumber
      ? ["centrexExtension"]
      : ["centrexLineNumber"],
    message:
      "센트릭스 전체 회선번호와 내선번호를 함께 입력해 주세요.",
  });
}

export const staffLoginSchema = z
  .object({
    email: normalizedEmailSchema,
    password: z
      .string()
      .min(1, "비밀번호를 입력해 주세요.")
      .max(128, "비밀번호는 128자 이하여야 합니다."),
  })
  .strict();

export const staffInvitationCreationSchema = z
  .object({
    email: normalizedEmailSchema,
    name: z
      .string()
      .trim()
      .min(2, "이름은 2자 이상이어야 합니다.")
      .max(50, "이름은 50자 이하여야 합니다."),
    organization: staffOrganizationSchema.default("lawand"),
    region: staffRegionSchema.default("seoul"),
    department: z
      .string()
      .trim()
      .min(1, "부서를 입력해 주세요.")
      .max(100, "부서는 100자 이하여야 합니다.")
      .default("미입력"),
    jobTitle: z
      .string()
      .trim()
      .min(1, "직책을 입력해 주세요.")
      .max(100, "직책은 100자 이하여야 합니다.")
      .default("미입력"),
    role: staffRoleSchema.default("full_time"),
    centrexLineNumber: centrexLineNumberSchema.optional(),
    centrexExtension: centrexExtensionSchema.optional(),
    legalFriendsId: legalFriendsAccountIdSchema.optional(),
    legalFriendsMemberIdx: legalFriendsMemberIdxSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    requireCentrexPair(value, context);
    if (Boolean(value.legalFriendsId) !== Boolean(value.legalFriendsMemberIdx)) {
      context.addIssue({
        code: "custom",
        path: value.legalFriendsId
          ? ["legalFriendsMemberIdx"]
          : ["legalFriendsId"],
        message:
          "리걸프렌즈 아이디와 member_idx를 함께 입력해 주세요.",
      });
    }
  });

export const staffProfileUpdateSchema = z
  .object({
    organization: staffOrganizationSchema,
    region: staffRegionSchema,
    department: z
      .string()
      .trim()
      .min(1, "부서를 입력해 주세요.")
      .max(100, "부서는 100자 이하여야 합니다."),
    jobTitle: z
      .string()
      .trim()
      .min(1, "직책을 입력해 주세요.")
      .max(100, "직책은 100자 이하여야 합니다."),
    role: staffRoleSchema.optional(),
  })
  .strict();

export const staffExternalAccountUpdateSchema = z
  .object({
    legalFriendsId: legalFriendsAccountIdSchema.nullable(),
    legalFriendsMemberIdx: legalFriendsMemberIdxSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.legalFriendsId) !== Boolean(value.legalFriendsMemberIdx)) {
      context.addIssue({
        code: "custom",
        path: value.legalFriendsId
          ? ["legalFriendsMemberIdx"]
          : ["legalFriendsId"],
        message:
          "리걸프렌즈 아이디와 member_idx를 함께 입력하거나 둘 다 비워 주세요.",
      });
    }
  });

export const staffCentrexLineUpdateSchema = z
  .object({
    centrexLineNumber: centrexLineNumberSchema.nullable(),
    centrexExtension: centrexExtensionSchema.nullable(),
    centrexPassword: centrexPasswordSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    requireCentrexPair(value, context);
    if (value.centrexLineNumber && !value.centrexPassword) {
      context.addIssue({
        code: "custom",
        path: ["centrexPassword"],
        message: "회선 검증을 위해 센트릭스 비밀번호를 입력해 주세요.",
      });
    }
    if (!value.centrexLineNumber && value.centrexPassword) {
      context.addIssue({
        code: "custom",
        path: ["centrexPassword"],
        message: "회선번호와 내선번호를 입력한 경우에만 비밀번호를 검증할 수 있습니다.",
      });
    }
  });

export const staffInvitationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "초대 토큰 형식이 올바르지 않습니다.");

export const staffPasswordSchema = z
  .string()
  .min(12, "비밀번호는 12자 이상이어야 합니다.")
  .max(128, "비밀번호는 128자 이하여야 합니다.")
  .regex(/[A-Z]/, "비밀번호에 영문 대문자를 포함해 주세요.")
  .regex(/[a-z]/, "비밀번호에 영문 소문자를 포함해 주세요.")
  .regex(/[0-9]/, "비밀번호에 숫자를 포함해 주세요.")
  .regex(/[^A-Za-z0-9]/, "비밀번호에 특수문자를 포함해 주세요.");

export const staffPasswordChangeSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "현재 비밀번호를 입력해 주세요.")
      .max(128, "현재 비밀번호는 128자 이하여야 합니다."),
    newPassword: staffPasswordSchema,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "새 비밀번호는 현재 비밀번호와 다르게 설정해 주세요.",
  });

export const staffInvitationAcceptanceSchema = z
  .object({
    token: staffInvitationTokenSchema,
    password: staffPasswordSchema,
  })
  .strict();

export const staffSessionTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "세션 토큰 형식이 올바르지 않습니다.");

export type StaffRole = z.infer<typeof staffRoleSchema>;
export type StaffOrganization = z.infer<typeof staffOrganizationSchema>;
export type StaffRegion = z.infer<typeof staffRegionSchema>;
export type StaffLogin = z.infer<typeof staffLoginSchema>;
export type StaffInvitationCreation = z.infer<
  typeof staffInvitationCreationSchema
>;
export type StaffInvitationAcceptance = z.infer<
  typeof staffInvitationAcceptanceSchema
>;
export type StaffProfileUpdate = z.infer<typeof staffProfileUpdateSchema>;
export type StaffPasswordChange = z.infer<
  typeof staffPasswordChangeSchema
>;
export type StaffExternalAccountUpdate = z.infer<
  typeof staffExternalAccountUpdateSchema
>;
export type StaffCentrexLineUpdate = z.infer<
  typeof staffCentrexLineUpdateSchema
>;
