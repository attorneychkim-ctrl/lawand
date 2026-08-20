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
                True(
                    DeliveryDispositionPolicy.AlreadyDisplayed(
                        new List<string> { "delivery-1" },
                        "delivery-1"),
                    "delivery deduplication");
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
