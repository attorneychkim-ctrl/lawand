using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Lawand.CentrexBridge
{
    internal sealed class BridgeConfiguration
    {
        private static readonly Regex StableIdPattern = new Regex(
            "^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$",
            RegexOptions.CultureInvariant);
        private string _sourcePath;

        public string BridgeId { get; set; }
        public string EndpointId { get; set; }
        public string CredentialTarget { get; set; }
        public string GatewayUrl { get; set; }
        public string GatewayCredentialTarget { get; set; }
        public string ExpectedExtension { get; set; }
        public string ExpectedLineLast4 { get; set; }
        public int AutoReconnectSeconds { get; set; }
        public int HealthCheckSeconds { get; set; }
        public int LogRetentionDays { get; set; }
        public int GatewayTimeoutSeconds { get; set; }
        public int GatewayRetrySeconds { get; set; }
        public int GatewayCommandPollMilliseconds { get; set; }
        public int GatewayEventRetentionHours { get; set; }
        public bool? ShowTrayIcon { get; set; }
        public bool? PoolSlotPending { get; set; }

        public string MutexName
        {
            get { return "Local\\Lawand.CentrexBridge." + BridgeId; }
        }

        public string DataDirectory
        {
            get
            {
                if (string.IsNullOrWhiteSpace(_sourcePath))
                {
                    throw new InvalidOperationException("설정 파일 경로를 확인할 수 없습니다.");
                }

                return Path.GetDirectoryName(_sourcePath);
            }
        }

        public bool TrayIconEnabled
        {
            get { return !ShowTrayIcon.HasValue || ShowTrayIcon.Value; }
        }

        public bool IsPoolSlotPending
        {
            get
            {
                return PoolSlotPending == true ||
                    (string.Equals(ExpectedExtension, "0000", StringComparison.Ordinal) &&
                     string.Equals(ExpectedLineLast4, "0000", StringComparison.Ordinal));
            }
        }

        public static BridgeConfiguration Load(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            {
                throw new FileNotFoundException("브리지 설정 파일을 찾을 수 없습니다.", path);
            }

            string json = File.ReadAllText(path, new UTF8Encoding(false, true));
            BridgeConfiguration configuration =
                new JavaScriptSerializer().Deserialize<BridgeConfiguration>(json);
            if (configuration == null)
            {
                throw new InvalidDataException("브리지 설정 파일을 읽을 수 없습니다.");
            }

            configuration._sourcePath = Path.GetFullPath(path);
            configuration.Validate();
            return configuration;
        }

        public void UpdateEndpoint(
            string endpointId,
            string expectedExtension,
            string expectedLineLast4)
        {
            RequireStableId(endpointId, "endpointId");
            string normalizedExtension = DigitsOnly(
                expectedExtension,
                "expectedExtension");
            string normalizedLineLast4 = DigitsOnly(
                expectedLineLast4,
                "expectedLineLast4");
            if (normalizedLineLast4.Length != 4)
            {
                throw new InvalidDataException("expectedLineLast4는 숫자 네 자리여야 합니다.");
            }
            if (string.IsNullOrWhiteSpace(_sourcePath))
            {
                throw new InvalidOperationException("설정 파일 경로를 확인할 수 없습니다.");
            }

            Dictionary<string, object> value = new Dictionary<string, object>
            {
                { "bridgeId", BridgeId },
                { "endpointId", endpointId },
                { "credentialTarget", CredentialTarget },
                { "gatewayUrl", GatewayUrl },
                { "gatewayCredentialTarget", GatewayCredentialTarget },
                { "expectedExtension", normalizedExtension },
                { "expectedLineLast4", normalizedLineLast4 },
                { "autoReconnectSeconds", AutoReconnectSeconds },
                { "healthCheckSeconds", HealthCheckSeconds },
                { "logRetentionDays", LogRetentionDays },
                { "gatewayTimeoutSeconds", GatewayTimeoutSeconds },
                { "gatewayRetrySeconds", GatewayRetrySeconds },
                { "gatewayCommandPollMilliseconds", GatewayCommandPollMilliseconds },
                { "gatewayEventRetentionHours", GatewayEventRetentionHours },
                { "showTrayIcon", TrayIconEnabled },
                {
                    "poolSlotPending",
                    string.Equals(normalizedExtension, "0000", StringComparison.Ordinal) &&
                    string.Equals(normalizedLineLast4, "0000", StringComparison.Ordinal)
                }
            };
            string temporaryPath = _sourcePath + ".pending";
            string backupPath = _sourcePath + ".previous";
            try
            {
                string json = new JavaScriptSerializer().Serialize(value);
                File.WriteAllText(temporaryPath, json, new UTF8Encoding(false, true));
                File.Replace(temporaryPath, _sourcePath, backupPath, true);
            }
            finally
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }

            EndpointId = endpointId;
            ExpectedExtension = normalizedExtension;
            ExpectedLineLast4 = normalizedLineLast4;
            PoolSlotPending = string.Equals(
                normalizedExtension,
                "0000",
                StringComparison.Ordinal) && string.Equals(
                    normalizedLineLast4,
                    "0000",
                    StringComparison.Ordinal);
        }

        private void Validate()
        {
            RequireStableId(BridgeId, "bridgeId");
            RequireStableId(EndpointId, "endpointId");

            if (string.IsNullOrWhiteSpace(CredentialTarget) ||
                !CredentialTarget.StartsWith("Lawand/Centrex/", StringComparison.Ordinal) ||
                CredentialTarget.Length > 180)
            {
                throw new InvalidDataException("credentialTarget은 Lawand/Centrex/로 시작해야 합니다.");
            }

            Uri gatewayUri;
            if (string.IsNullOrWhiteSpace(GatewayUrl) ||
                !Uri.TryCreate(GatewayUrl, UriKind.Absolute, out gatewayUri) ||
                !string.Equals(gatewayUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(gatewayUri.AbsolutePath, "/v1/centrex-bridge/events", StringComparison.Ordinal) ||
                !string.IsNullOrEmpty(gatewayUri.Query) ||
                !string.IsNullOrEmpty(gatewayUri.Fragment) ||
                !string.IsNullOrEmpty(gatewayUri.UserInfo))
            {
                throw new InvalidDataException(
                    "gatewayUrl은 HTTPS /v1/centrex-bridge/events 주소여야 합니다.");
            }
            GatewayUrl = gatewayUri.AbsoluteUri;

            if (string.IsNullOrWhiteSpace(GatewayCredentialTarget) ||
                !GatewayCredentialTarget.StartsWith(
                    "Lawand/CentrexGateway/",
                    StringComparison.Ordinal) ||
                GatewayCredentialTarget.Length > 180)
            {
                throw new InvalidDataException(
                    "gatewayCredentialTarget은 Lawand/CentrexGateway/로 시작해야 합니다.");
            }

            ExpectedExtension = DigitsOnly(ExpectedExtension, "expectedExtension");
            ExpectedLineLast4 = DigitsOnly(ExpectedLineLast4, "expectedLineLast4");
            if (ExpectedLineLast4.Length != 4)
            {
                throw new InvalidDataException("expectedLineLast4는 숫자 네 자리여야 합니다.");
            }

            AutoReconnectSeconds = InRangeOrDefault(AutoReconnectSeconds, 5, 300, 20);
            HealthCheckSeconds = InRangeOrDefault(HealthCheckSeconds, 5, 300, 15);
            LogRetentionDays = InRangeOrDefault(LogRetentionDays, 1, 90, 14);
            GatewayTimeoutSeconds = InRangeOrDefault(
                GatewayTimeoutSeconds,
                2,
                60,
                10);
            GatewayRetrySeconds = InRangeOrDefault(
                GatewayRetrySeconds,
                2,
                300,
                5);
            GatewayCommandPollMilliseconds = InRangeOrDefault(
                GatewayCommandPollMilliseconds,
                250,
                5000,
                750);
            GatewayEventRetentionHours = InRangeOrDefault(
                GatewayEventRetentionHours,
                24,
                720,
                168);
        }

        private static void RequireStableId(string value, string field)
        {
            if (string.IsNullOrWhiteSpace(value) || !StableIdPattern.IsMatch(value))
            {
                throw new InvalidDataException(field + " 형식이 올바르지 않습니다.");
            }
        }

        private static string DigitsOnly(string value, string field)
        {
            if (string.IsNullOrWhiteSpace(value) || !Regex.IsMatch(value, "^[0-9]{1,32}$"))
            {
                throw new InvalidDataException(field + "는 숫자만 사용할 수 있습니다.");
            }

            return value;
        }

        private static int InRangeOrDefault(int value, int minimum, int maximum, int defaultValue)
        {
            if (value == 0)
            {
                return defaultValue;
            }

            if (value < minimum || value > maximum)
            {
                throw new InvalidDataException("설정의 시간 또는 보존 기간 범위가 올바르지 않습니다.");
            }

            return value;
        }
    }
}
