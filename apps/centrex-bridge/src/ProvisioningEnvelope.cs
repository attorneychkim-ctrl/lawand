using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Lawand.CentrexBridge
{
    internal sealed class GatewayCredentialEnvelope
    {
        public string Algorithm { get; set; }
        public string Iv { get; set; }
        public string Ciphertext { get; set; }
        public string Mac { get; set; }
    }

    internal static class ProvisioningEnvelope
    {
        private static readonly Regex LoginPattern = new Regex(
            "^[0-9]{8,50}$",
            RegexOptions.CultureInvariant);

        public static CentrexCredential Decrypt(
            BridgeConfiguration configuration,
            string commandId,
            GatewayCredentialEnvelope envelope)
        {
            CentrexCredential gatewayCredential = CredentialStore.Read(
                configuration.GatewayCredentialTarget);
            if (!string.Equals(
                gatewayCredential.LoginId,
                configuration.BridgeId,
                StringComparison.Ordinal))
            {
                throw new InvalidDataException(
                    "gateway 자격 증명의 bridge ID가 설정과 다릅니다.");
            }

            byte[] secret = null;
            try
            {
                secret = GatewaySecretEncoding.Decode(gatewayCredential.Password);
                return DecryptWithSecret(commandId, envelope, secret);
            }
            finally
            {
                gatewayCredential = null;
                Clear(secret);
            }
        }

        internal static CentrexCredential DecryptWithSecret(
            string commandId,
            GatewayCredentialEnvelope envelope,
            byte[] secret)
        {
            if (envelope == null ||
                !string.Equals(
                    envelope.Algorithm,
                    "A256CBC-HS256",
                    StringComparison.Ordinal))
            {
                throw new InvalidDataException("지원하지 않는 bridge 자격 증명 암호문입니다.");
            }
            byte[] encryptionKey = null;
            byte[] macKey = null;
            byte[] iv = null;
            byte[] ciphertext = null;
            byte[] expectedMac = null;
            byte[] providedMac = null;
            byte[] macInput = null;
            byte[] plaintext = null;
            try
            {
                encryptionKey = DeriveKey(
                    secret,
                    "lawand-centrex-provisioning-encryption-v1");
                macKey = DeriveKey(
                    secret,
                    "lawand-centrex-provisioning-mac-v1");
                iv = DecodeBase64Url(envelope.Iv);
                ciphertext = DecodeBase64Url(envelope.Ciphertext);
                providedMac = DecodeBase64Url(envelope.Mac);
                if (iv.Length != 16 || ciphertext.Length == 0 || providedMac.Length != 32)
                {
                    throw new InvalidDataException("bridge 자격 증명 암호문 길이가 올바르지 않습니다.");
                }

                byte[] prefix = Encoding.UTF8.GetBytes("v1\n" + commandId + "\n");
                macInput = new byte[prefix.Length + iv.Length + ciphertext.Length];
                Buffer.BlockCopy(prefix, 0, macInput, 0, prefix.Length);
                Buffer.BlockCopy(iv, 0, macInput, prefix.Length, iv.Length);
                Buffer.BlockCopy(
                    ciphertext,
                    0,
                    macInput,
                    prefix.Length + iv.Length,
                    ciphertext.Length);
                Clear(prefix);
                using (HMACSHA256 hmac = new HMACSHA256(macKey))
                {
                    expectedMac = hmac.ComputeHash(macInput);
                }
                if (!FixedTimeEquals(expectedMac, providedMac))
                {
                    throw new CryptographicException("bridge 자격 증명 암호문 인증에 실패했습니다.");
                }

                using (Aes aes = Aes.Create())
                {
                    aes.KeySize = 256;
                    aes.Mode = CipherMode.CBC;
                    aes.Padding = PaddingMode.PKCS7;
                    aes.Key = encryptionKey;
                    aes.IV = iv;
                    using (ICryptoTransform decryptor = aes.CreateDecryptor())
                    {
                        plaintext = decryptor.TransformFinalBlock(
                            ciphertext,
                            0,
                            ciphertext.Length);
                    }
                }
                string json = new UTF8Encoding(false, true).GetString(plaintext);
                Dictionary<string, object> value = new JavaScriptSerializer()
                    .DeserializeObject(json) as Dictionary<string, object>;
                string loginId = ReadString(value, "loginId");
                string password = ReadString(value, "password");
                if (!LoginPattern.IsMatch(loginId ?? string.Empty) ||
                    string.IsNullOrEmpty(password) ||
                    password.Length > 128)
                {
                    throw new InvalidDataException("bridge 로그인 자격 증명 형식이 올바르지 않습니다.");
                }
                return new CentrexCredential(loginId, password);
            }
            finally
            {
                Clear(encryptionKey);
                Clear(macKey);
                Clear(iv);
                Clear(ciphertext);
                Clear(expectedMac);
                Clear(providedMac);
                Clear(macInput);
                Clear(plaintext);
            }
        }

        private static byte[] DeriveKey(byte[] secret, string label)
        {
            using (HMACSHA256 hmac = new HMACSHA256(secret))
            {
                return hmac.ComputeHash(Encoding.UTF8.GetBytes(label));
            }
        }

        private static byte[] DecodeBase64Url(string value)
        {
            if (string.IsNullOrWhiteSpace(value) ||
                !Regex.IsMatch(value, "^[A-Za-z0-9_-]+$"))
            {
                throw new InvalidDataException("base64url 형식이 올바르지 않습니다.");
            }
            string normalized = value.Replace('-', '+').Replace('_', '/');
            normalized = normalized.PadRight(
                normalized.Length + ((4 - normalized.Length % 4) % 4),
                '=');
            return Convert.FromBase64String(normalized);
        }

        private static string ReadString(
            IDictionary<string, object> value,
            string key)
        {
            object result;
            return value != null &&
                value.TryGetValue(key, out result) &&
                result is string
                    ? (string)result
                    : null;
        }

        private static bool FixedTimeEquals(byte[] left, byte[] right)
        {
            if (left == null || right == null || left.Length != right.Length)
            {
                return false;
            }
            int difference = 0;
            for (int index = 0; index < left.Length; index++)
            {
                difference |= left[index] ^ right[index];
            }
            return difference == 0;
        }

        private static void Clear(byte[] value)
        {
            if (value != null)
            {
                Array.Clear(value, 0, value.Length);
            }
        }
    }
}
