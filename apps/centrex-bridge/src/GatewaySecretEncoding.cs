using System;
using System.Text.RegularExpressions;

namespace Lawand.CentrexBridge
{
    internal static class GatewaySecretEncoding
    {
        private static readonly Regex Base64Pattern = new Regex(
            "^[A-Za-z0-9+/_-]{43}=?$",
            RegexOptions.CultureInvariant);

        public static byte[] Decode(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || !Base64Pattern.IsMatch(value))
            {
                throw new FormatException("gateway secret 형식이 올바르지 않습니다.");
            }
            string normalized = value.Replace('-', '+').Replace('_', '/');
            int remainder = normalized.Length % 4;
            if (remainder != 0)
            {
                normalized = normalized.PadRight(normalized.Length + (4 - remainder), '=');
            }
            byte[] secret = Convert.FromBase64String(normalized);
            if (secret.Length != 32)
            {
                Array.Clear(secret, 0, secret.Length);
                throw new FormatException("gateway secret은 32바이트여야 합니다.");
            }
            return secret;
        }
    }
}
