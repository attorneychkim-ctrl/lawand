using System;
using System.Collections.Generic;

namespace Lawand.DesktopNotifier
{
    internal static class DeliveryDispositionPolicy
    {
        public static string ContentForDisplay(
            string body,
            bool sessionLocked,
            bool hideContentWhenLocked)
        {
            if (sessionLocked && hideContentWhenLocked)
            {
                return "잠금 화면에서는 고객 내용을 숨겼습니다. ERP에서 확인하세요.";
            }

            string normalized = (body ?? string.Empty).Trim();
            if (normalized.Length == 0)
            {
                return "새 업무 알림이 도착했습니다. ERP에서 확인하세요.";
            }

            return normalized.Length <= 1200
                ? normalized
                : normalized.Substring(0, 1197) + "...";
        }

        public static bool AlreadyDisplayed(IList<string> recentIds, string deliveryId)
        {
            return recentIds != null &&
                !string.IsNullOrWhiteSpace(deliveryId) &&
                recentIds.Contains(deliveryId);
        }
    }
}
