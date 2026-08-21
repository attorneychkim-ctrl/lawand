using System;
using System.Collections.Generic;

namespace Lawand.DesktopNotifier.Tests
{
    internal static class DesktopNotifierSelfTests
    {
        private static int Main()
        {
            try
            {
                Equal(
                    "https://api.lawandfirm.com",
                    UrlSafety.NormalizeBaseUrl(
                        "https://api.lawandfirm.com/",
                        "Gateway"),
                    "HTTPS gateway origin");
                Equal(
                    "http://localhost:3022",
                    UrlSafety.NormalizeBaseUrl(
                        "http://localhost:3022",
                        "Gateway"),
                    "loopback gateway origin");
                Throws(
                    delegate
                    {
                        UrlSafety.NormalizeBaseUrl(
                            "http://api.lawandfirm.com",
                            "Gateway");
                    },
                    "non-TLS remote gateway");
                True(
                    UrlSafety.IsAllowedErpDeepLink(
                        "https://erp.lawandfirm.com/consultations/123",
                        "https://erp.lawandfirm.com"),
                    "same-origin ERP deep link");
                False(
                    UrlSafety.IsAllowedErpDeepLink(
                        "https://evil.example/consultations/123",
                        "https://erp.lawandfirm.com"),
                    "cross-origin deep link");
                Equal(
                    "잠금 화면에서는 고객 내용을 숨겼습니다. ERP에서 확인하세요.",
                    DeliveryDispositionPolicy.ContentForDisplay(
                        "김로앤 · 010-0000-0000",
                        true,
                        true),
                    "lock screen content policy");
                Equal(
                    "김로앤 · 010-0000-0000",
                    DeliveryDispositionPolicy.ContentForDisplay(
                        "김로앤 · 010-0000-0000",
                        false,
                        true),
                    "unlocked content policy");
                string oversizedBody = new string('가', 1300);
                string limitedBody = DeliveryDispositionPolicy.ContentForDisplay(
                    oversizedBody,
                    false,
                    true);
                Equal(1200, limitedBody.Length, "display body length limit");
                True(limitedBody.EndsWith("..."), "display body ellipsis");
                True(
                    DeliveryDispositionPolicy.AlreadyDisplayed(
                        new List<string> { "delivery-1" },
                        "delivery-1"),
                    "delivery deduplication");
                Equal(
                    NotificationKind.Consultation,
                    NotificationPresentation.Resolve(
                        "desktop.consultation.assigned_repeat",
                        "consultation").Kind,
                    "consultation presentation");
                Equal(
                    NotificationKind.Message,
                    NotificationPresentation.Resolve(
                        "desktop.message_assigned_reply",
                        "message").Kind,
                    "message presentation");
                Equal(
                    NotificationKind.Review,
                    NotificationPresentation.Resolve(
                        "desktop.review.assigned_new",
                        "review").Kind,
                    "review presentation");
                Equal(
                    NotificationKind.ExternalPhone,
                    NotificationPresentation.Resolve(
                        "desktop.phone.targeted_inbound",
                        "phone").Kind,
                    "external phone presentation");
                Equal(
                    NotificationKind.InternalPhone,
                    NotificationPresentation.Resolve(
                        "desktop.phone.internal_inbound",
                        "phone").Kind,
                    "internal phone presentation");
                Equal(
                    NotificationKind.Transfer,
                    NotificationPresentation.Resolve(
                        "desktop.phone.transfer_returned",
                        "phone").Kind,
                    "transfer presentation");

                NotificationKind[] businessKinds = new NotificationKind[]
                {
                    NotificationKind.Consultation,
                    NotificationKind.Message,
                    NotificationKind.Review,
                    NotificationKind.ExternalPhone,
                    NotificationKind.InternalPhone,
                    NotificationKind.Transfer
                };
                HashSet<string> sizes = new HashSet<string>();
                HashSet<int> accents = new HashSet<int>();
                foreach (NotificationKind kind in businessKinds)
                {
                    NotificationPresentation presentation =
                        NotificationPresentation.ForKind(kind);
                    sizes.Add(
                        presentation.PopupSize.Width + "x" +
                        presentation.PopupSize.Height);
                    accents.Add(presentation.AccentColor.ToArgb());
                }
                Equal(6, sizes.Count, "six recognizable popup sizes");
                Equal(6, accents.Count, "six recognizable accent colors");

                Dictionary<NotificationKind, int> summaryCounts =
                    new Dictionary<NotificationKind, int>();
                summaryCounts[NotificationKind.ExternalPhone] = 2;
                summaryCounts[NotificationKind.Message] = 3;
                summaryCounts[NotificationKind.Consultation] = 1;
                Equal(
                    "고객 전화 2건  ·  상담 1건  ·  문자 3건",
                    NotificationPresentation.SummaryBody(summaryCounts),
                    "away summary order");
                Equal(
                    6,
                    NotificationPresentation.CountNotifications(summaryCounts),
                    "away summary total");

                IList<NotificationBodyItem> consultationItems =
                    NotificationBodyFormatter.Build(
                        NotificationKind.Consultation,
                        "고객명: 김로앤\r\n" +
                        "전화번호: 010-1234-5678\r\n" +
                        "접수 채널: 전화 상담\r\n" +
                        "상담 내용: 오늘 오후에 통화하고 싶습니다.");
                Equal(4, consultationItems.Count, "structured consultation items");
                Equal("고객명", consultationItems[0].Label, "customer label");
                Equal("김로앤", consultationItems[0].Value, "customer value");
                Equal("상담 내용", consultationItems[3].Label, "detail label");
                Equal(
                    "오늘 오후에 통화하고 싶습니다.",
                    consultationItems[3].Value,
                    "detail value");

                IList<NotificationBodyItem> summaryItems =
                    NotificationBodyFormatter.Build(
                        NotificationKind.Summary,
                        NotificationPresentation.SummaryBody(summaryCounts));
                Equal(3, summaryItems.Count, "structured summary items");
                Equal("고객 전화", summaryItems[0].Label, "summary phone label");
                Equal("2건", summaryItems[0].Value, "summary phone count");

                IList<NotificationBodyItem> testItems =
                    NotificationBodyFormatter.Build(
                        NotificationKind.Test,
                        "고객명: 김로앤\r\n" +
                        "전화번호: 010-0000-0000\r\n" +
                        "알림 목적: 우측 상단 업무 카드 표시 확인\r\n" +
                        "테스트 내용: 실제 내용 필드 확인");
                Equal(4, testItems.Count, "structured test items");
                Equal("테스트 내용", testItems[3].Label, "test detail label");
                Console.WriteLine("Desktop notifier self-tests passed.");
                return 0;
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine(exception.Message);
                return 1;
            }
        }

        private static void Equal(string expected, string actual, string name)
        {
            if (!string.Equals(expected, actual, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    name + " failed: expected '" + expected + "', got '" + actual + "'.");
            }
        }

        private static void Equal(int expected, int actual, string name)
        {
            if (expected != actual)
            {
                throw new InvalidOperationException(
                    name + " failed: expected '" + expected +
                    "', got '" + actual + "'.");
            }
        }

        private static void Equal(
            NotificationKind expected,
            NotificationKind actual,
            string name)
        {
            if (expected != actual)
            {
                throw new InvalidOperationException(
                    name + " failed: expected '" + expected +
                    "', got '" + actual + "'.");
            }
        }

        private static void True(bool value, string name)
        {
            if (!value)
            {
                throw new InvalidOperationException(name + " failed.");
            }
        }

        private static void False(bool value, string name)
        {
            True(!value, name);
        }

        private static void Throws(Action action, string name)
        {
            try
            {
                action();
            }
            catch (ArgumentException)
            {
                return;
            }
            throw new InvalidOperationException(name + " failed.");
        }
    }
}
