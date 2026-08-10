using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Lawand.CentrexBridge
{
    internal static class AwsGatewayCredentialProvisioner
    {
        private static readonly Regex SecretIdPattern = new Regex(
            "^lawand/[A-Za-z0-9/_-]{3,180}$",
            RegexOptions.CultureInvariant);

        private sealed class GatewaySecret
        {
            public string bridgeId { get; set; }
            public string endpointId { get; set; }
            public string secret { get; set; }
        }

        private sealed class GatewaySecretRegistry
        {
            public Dictionary<string, GatewaySecret> bridges { get; set; }
        }

        public static void Provision(
            BridgeConfiguration configuration,
            string secretId)
        {
            if (string.IsNullOrWhiteSpace(secretId) ||
                !SecretIdPattern.IsMatch(secretId))
            {
                throw new ArgumentException("AWS secret ID 형식이 올바르지 않습니다.");
            }

            string aws = FindAwsCli();
            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = aws;
            start.Arguments =
                "secretsmanager get-secret-value --region ap-northeast-2 --secret-id " +
                secretId + " --query SecretString --output text";
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;

            string output;
            using (Process process = Process.Start(start))
            {
                output = process.StandardOutput.ReadToEnd();
                process.StandardError.ReadToEnd();
                process.WaitForExit();
                if (process.ExitCode != 0)
                {
                    throw new InvalidOperationException(
                        "AWS Secrets Manager에서 gateway 자격 증명을 읽지 못했습니다.");
                }
            }

            GatewaySecret value;
            try
            {
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                GatewaySecret legacy = serializer.Deserialize<GatewaySecret>(output);
                if (legacy != null && !string.IsNullOrWhiteSpace(legacy.bridgeId))
                {
                    value = legacy;
                }
                else
                {
                    GatewaySecretRegistry registry =
                        serializer.Deserialize<GatewaySecretRegistry>(output);
                    Dictionary<string, GatewaySecret> bridges =
                        registry == null ? null : registry.bridges;
                    if (bridges == null)
                    {
                        bridges = serializer.Deserialize<Dictionary<string, GatewaySecret>>(output);
                    }
                    GatewaySecret selected;
                    value = bridges != null && bridges.TryGetValue(
                        configuration.BridgeId,
                        out selected)
                            ? selected
                            : null;
                    if (value != null && string.IsNullOrWhiteSpace(value.bridgeId))
                    {
                        value.bridgeId = configuration.BridgeId;
                    }
                }
            }
            finally
            {
                output = null;
            }
            if (value == null ||
                !string.Equals(value.bridgeId, configuration.BridgeId, StringComparison.Ordinal))
            {
                throw new InvalidDataException(
                    "AWS gateway 자격 증명의 bridge가 설정과 다릅니다.");
            }
            byte[] secretBytes;
            try
            {
                secretBytes = GatewaySecretEncoding.Decode(value.secret);
            }
            catch (FormatException)
            {
                throw new InvalidDataException(
                    "AWS gateway secret 형식이 올바르지 않습니다.");
            }
            Array.Clear(secretBytes, 0, secretBytes.Length);

            CredentialStore.Write(
                configuration.GatewayCredentialTarget,
                value.bridgeId,
                value.secret);
            value.secret = null;
        }

        private static string FindAwsCli()
        {
            string installed = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Amazon",
                "AWSCLIV2",
                "aws.exe");
            if (File.Exists(installed))
            {
                return installed;
            }
            return "aws.exe";
        }
    }
}
