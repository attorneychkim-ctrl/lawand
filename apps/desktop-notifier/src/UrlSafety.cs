using System;

namespace Lawand.DesktopNotifier
{
    internal static class UrlSafety
    {
        public static string NormalizeBaseUrl(string raw, string fieldName)
        {
            Uri uri;
            if (string.IsNullOrWhiteSpace(raw) ||
                !Uri.TryCreate(raw.Trim(), UriKind.Absolute, out uri) ||
                !IsSafeTransport(uri) ||
                !string.IsNullOrEmpty(uri.UserInfo) ||
                !string.IsNullOrEmpty(uri.Query) ||
                !string.IsNullOrEmpty(uri.Fragment) ||
                (uri.AbsolutePath != "/" && uri.AbsolutePath != string.Empty))
            {
                throw new ArgumentException(
                    fieldName + "은 HTTPS 주소여야 합니다. 로컬 개발은 localhost HTTP만 허용합니다.");
            }

            return uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
        }

        public static bool IsAllowedErpDeepLink(string raw, string erpBaseUrl)
        {
            Uri candidate;
            Uri expected;
            if (!Uri.TryCreate(raw, UriKind.Absolute, out candidate) ||
                !Uri.TryCreate(erpBaseUrl, UriKind.Absolute, out expected) ||
                !IsSafeTransport(candidate) ||
                !string.IsNullOrEmpty(candidate.UserInfo))
            {
                return false;
            }

            return string.Equals(candidate.Scheme, expected.Scheme, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(candidate.Host, expected.Host, StringComparison.OrdinalIgnoreCase) &&
                candidate.Port == expected.Port;
        }

        private static bool IsSafeTransport(Uri uri)
        {
            if (string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) &&
                uri.IsLoopback;
        }
    }
}
