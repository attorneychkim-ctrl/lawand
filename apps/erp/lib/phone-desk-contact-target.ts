import type { PhoneDeskCallDetail } from "./gateway";

export type PhoneDeskContactTarget =
  | {
      source: "consultation";
      consultationId: string;
      customerName: string;
      receiptCode: string;
    }
  | {
      source: "legal_friends_directory";
      clientIdx: number;
      caseIdx: number;
      customerName: string;
      receiptCode: string;
    };

export function getPhoneDeskContactTarget(
  detail: PhoneDeskCallDetail,
): PhoneDeskContactTarget | null {
  const consultation = detail.call.clickToCall?.consultation ??
    (detail.call.customerMatch?.source === "consultation"
      ? detail.call.customerMatch.consultation
      : null);
  if (consultation) {
    return {
      source: "consultation",
      consultationId: consultation.id,
      customerName: consultation.displayName,
      receiptCode: consultation.publicReceiptCode,
    };
  }

  const clickedDirectory = detail.call.clickToCall?.directoryClient;
  if (clickedDirectory) {
    return {
      source: "legal_friends_directory",
      clientIdx: clickedDirectory.clientIdx,
      caseIdx: clickedDirectory.caseIdx,
      customerName: clickedDirectory.displayName,
      receiptCode: "리걸프렌즈",
    };
  }

  const legalFriends = detail.legalFriendsMatch;
  const latestCase = legalFriends?.cases[0];
  if (legalFriends && latestCase) {
    return {
      source: "legal_friends_directory",
      clientIdx: latestCase.clientIdx,
      caseIdx: latestCase.caseIdx,
      customerName: legalFriends.clientName,
      receiptCode: latestCase.caseNumber ?? "리걸프렌즈",
    };
  }

  return null;
}
