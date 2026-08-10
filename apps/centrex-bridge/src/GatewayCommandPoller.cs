using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Lawand.CentrexBridge
{
    internal sealed class GatewayBridgeCommand
    {
        public int SchemaVersion { get; set; }
        public string CommandId { get; set; }
        public string InboundCallId { get; set; }
        public string CommandType { get; set; }
        public string ExpectedProviderCallId { get; set; }
        public string EndpointId { get; set; }
        public string ExpectedExtension { get; set; }
        public string ExpectedLineLast4 { get; set; }
        public GatewayCredentialEnvelope CredentialEnvelope { get; set; }
        public string ExpiresAt { get; set; }
    }

    internal sealed class GatewayBridgeCommandEventArgs : EventArgs
    {
        public GatewayBridgeCommandEventArgs(GatewayBridgeCommand command)
        {
            Command = command;
        }

        public GatewayBridgeCommand Command { get; private set; }
    }

    internal sealed class GatewayCommandPoller : IDisposable
    {
        private static readonly DateTimeOffset UnixEpoch =
            new DateTimeOffset(1970, 1, 1, 0, 0, 0, TimeSpan.Zero);
        private static readonly Regex ResultCodePattern = new Regex(
            "^[A-Za-z0-9_.:-]{1,60}$",
            RegexOptions.CultureInvariant);

        private readonly BridgeConfiguration _configuration;
        private readonly SafeLogger _logger;
        private readonly HttpClient _httpClient;
        private readonly Timer _timer;
        private readonly object _sync = new object();
        private readonly Uri _pollUrl;
        private readonly string _heartbeatPath;
        private DateTimeOffset _lastHeartbeatWriteAt = DateTimeOffset.MinValue;
        private int _processing;
        private bool _disposed;
        private GatewayBridgeCommand _activeCommand;
        private PendingCompletion _pendingCompletion;

        public GatewayCommandPoller(
            BridgeConfiguration configuration,
            SafeLogger logger)
        {
            _configuration = configuration;
            _logger = logger;
            Uri gatewayBase = new Uri(configuration.GatewayUrl);
            _pollUrl = new Uri(
                gatewayBase,
                "/v1/centrex-bridge/commands/next");
            _heartbeatPath = Path.Combine(
                configuration.DataDirectory,
                "gateway-heartbeat.utc");
            _httpClient = new HttpClient(new HttpClientHandler
            {
                UseProxy = false
            });
            _httpClient.Timeout = TimeSpan.FromSeconds(
                configuration.GatewayTimeoutSeconds);
            _timer = new Timer(ProcessTimer, null, Timeout.Infinite, Timeout.Infinite);
        }

        public event EventHandler<GatewayBridgeCommandEventArgs> CommandReceived;

        public void Start()
        {
            ThrowIfDisposed();
            _timer.Change(500, _configuration.GatewayCommandPollMilliseconds);
        }

        public void Complete(
            GatewayBridgeCommand command,
            bool succeeded,
            string resultCode)
        {
            ThrowIfDisposed();
            string safeResult = CentrexEventParser.SafeToken(resultCode, 60);
            if (!ResultCodePattern.IsMatch(safeResult))
            {
                safeResult = "invalid_bridge_result";
                succeeded = false;
            }

            lock (_sync)
            {
                if (_activeCommand == null ||
                    !string.Equals(
                        _activeCommand.CommandId,
                        command.CommandId,
                        StringComparison.OrdinalIgnoreCase))
                {
                    _logger.Warn("GATEWAY_COMMAND_COMPLETION_IGNORED");
                    return;
                }
                _pendingCompletion = new PendingCompletion(
                    command,
                    succeeded,
                    safeResult);
            }
            _timer.Change(0, _configuration.GatewayCommandPollMilliseconds);
        }

        private async void ProcessTimer(object state)
        {
            if (_disposed || Interlocked.Exchange(ref _processing, 1) != 0)
            {
                return;
            }

            try
            {
                PendingCompletion completion;
                GatewayBridgeCommand active;
                lock (_sync)
                {
                    completion = _pendingCompletion;
                    active = _activeCommand;
                }

                if (completion != null)
                {
                    await SendCompletion(completion).ConfigureAwait(false);
                }
                else if (active == null)
                {
                    await Poll().ConfigureAwait(false);
                }
                else if (
                    string.Equals(
                        active.CommandType,
                        "provision",
                        StringComparison.Ordinal) &&
                    IsExpired(active))
                {
                    Complete(active, false, "provision_timeout");
                }
            }
            catch (Exception exception)
            {
                _logger.Error("GATEWAY_COMMAND_POLL_FAILED", exception);
            }
            finally
            {
                Interlocked.Exchange(ref _processing, 0);
            }
        }

        private async Task Poll()
        {
            using (HttpRequestMessage request = CreateSignedRequest(
                HttpMethod.Get,
                _pollUrl,
                new byte[0]))
            using (HttpResponseMessage response = await _httpClient
                .SendAsync(request)
                .ConfigureAwait(false))
            {
                if (response.StatusCode == HttpStatusCode.NoContent)
                {
                    RecordHeartbeat();
                    return;
                }
                if (response.StatusCode != HttpStatusCode.OK)
                {
                    _logger.Warn(
                        "GATEWAY_COMMAND_POLL_RETRY",
                        "STATUS=" + ((int)response.StatusCode).ToString(
                            CultureInfo.InvariantCulture));
                    return;
                }

                RecordHeartbeat();

                string json = await response.Content.ReadAsStringAsync()
                    .ConfigureAwait(false);
                GatewayBridgeCommand command = ParseCommand(json);
                if (!IsValid(command))
                {
                    _logger.Warn("GATEWAY_COMMAND_REJECTED");
                    return;
                }

                lock (_sync)
                {
                    if (_activeCommand != null)
                    {
                        return;
                    }
                    _activeCommand = command;
                }
                _logger.Info(
                    "GATEWAY_COMMAND_RECEIVED",
                    "TYPE=" + command.CommandType,
                    "COMMAND=" + command.CommandId);
                EventHandler<GatewayBridgeCommandEventArgs> handler = CommandReceived;
                if (handler != null)
                {
                    handler(this, new GatewayBridgeCommandEventArgs(command));
                }
                else
                {
                    Complete(command, false, "command_handler_unavailable");
                }
            }
        }

        private void RecordHeartbeat()
        {
            DateTimeOffset now = DateTimeOffset.UtcNow;
            lock (_sync)
            {
                if (now - _lastHeartbeatWriteAt < TimeSpan.FromSeconds(10))
                {
                    return;
                }
                _lastHeartbeatWriteAt = now;
            }

            string temporaryPath = _heartbeatPath + ".pending";
            try
            {
                File.WriteAllText(
                    temporaryPath,
                    now.ToString("o", CultureInfo.InvariantCulture),
                    new UTF8Encoding(false));
                if (File.Exists(_heartbeatPath))
                {
                    File.Replace(temporaryPath, _heartbeatPath, null, true);
                }
                else
                {
                    File.Move(temporaryPath, _heartbeatPath);
                }
            }
            finally
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }
        }

        private async Task SendCompletion(PendingCompletion completion)
        {
            byte[] body = null;
            try
            {
                Dictionary<string, object> payload = new Dictionary<string, object>
                {
                    { "schemaVersion", 1 },
                    { "commandId", completion.Command.CommandId },
                    { "status", completion.Succeeded ? "succeeded" : "failed" },
                    { "resultCode", completion.ResultCode }
                };
                body = Encoding.UTF8.GetBytes(
                    new JavaScriptSerializer().Serialize(payload));
                Uri resultUrl = new Uri(
                    _pollUrl,
                    "/v1/centrex-bridge/commands/" +
                    completion.Command.CommandId +
                    "/result");
                using (HttpRequestMessage request = CreateSignedRequest(
                    HttpMethod.Post,
                    resultUrl,
                    body))
                using (HttpResponseMessage response = await _httpClient
                    .SendAsync(request)
                    .ConfigureAwait(false))
                {
                    if (response.StatusCode != HttpStatusCode.OK)
                    {
                        _logger.Warn(
                            "GATEWAY_COMMAND_RESULT_RETRY",
                            "STATUS=" + ((int)response.StatusCode).ToString(
                                CultureInfo.InvariantCulture));
                        return;
                    }
                }

                lock (_sync)
                {
                    if (_pendingCompletion == completion)
                    {
                        _pendingCompletion = null;
                        _activeCommand = null;
                    }
                }
                _logger.Info(
                    "GATEWAY_COMMAND_COMPLETED",
                    "TYPE=" + completion.Command.CommandType,
                    "RESULT=" + completion.ResultCode);
            }
            finally
            {
                Clear(body);
            }
        }

        private HttpRequestMessage CreateSignedRequest(
            HttpMethod method,
            Uri url,
            byte[] body)
        {
            CentrexCredential credential = CredentialStore.Read(
                _configuration.GatewayCredentialTarget);
            if (!string.Equals(
                credential.LoginId,
                _configuration.BridgeId,
                StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "gateway 자격 증명의 bridge ID가 설정과 다릅니다.");
            }

            byte[] secret = null;
            try
            {
                secret = GatewaySecretEncoding.Decode(credential.Password);
                string timestamp = ((long)(DateTimeOffset.UtcNow - UnixEpoch).TotalSeconds)
                    .ToString(CultureInfo.InvariantCulture);
                string nonce = CreateNonce();
                string canonical = string.Join("\n", new[]
                {
                    "v1",
                    method.Method.ToUpperInvariant(),
                    url.AbsolutePath,
                    _configuration.BridgeId,
                    timestamp,
                    nonce,
                    Hex(Sha256(body))
                });
                string signature;
                using (HMACSHA256 hmac = new HMACSHA256(secret))
                {
                    signature = Hex(hmac.ComputeHash(
                        Encoding.UTF8.GetBytes(canonical)));
                }

                HttpRequestMessage request = new HttpRequestMessage(method, url);
                if (method == HttpMethod.Post)
                {
                    request.Content = new ByteArrayContent(body);
                    request.Content.Headers.ContentType =
                        new System.Net.Http.Headers.MediaTypeHeaderValue(
                            "application/json");
                }
                request.Headers.Add("x-lawand-bridge-id", _configuration.BridgeId);
                request.Headers.Add("x-lawand-bridge-timestamp", timestamp);
                request.Headers.Add("x-lawand-bridge-nonce", nonce);
                request.Headers.Add("x-lawand-bridge-signature", "v1=" + signature);
                return request;
            }
            finally
            {
                Clear(secret);
                credential = null;
            }
        }

        private static bool IsValid(GatewayBridgeCommand command)
        {
            Guid commandId;
            DateTimeOffset expiresAt;
            if (command == null ||
                command.SchemaVersion != 1 ||
                !Guid.TryParse(command.CommandId, out commandId) ||
                !DateTimeOffset.TryParse(
                    command.ExpiresAt,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out expiresAt) ||
                expiresAt <= DateTimeOffset.UtcNow.AddSeconds(-5))
            {
                return false;
            }
            if (string.Equals(command.CommandType, "answer", StringComparison.Ordinal))
            {
                Guid callId;
                return Guid.TryParse(command.InboundCallId, out callId) &&
                    !string.IsNullOrWhiteSpace(command.ExpectedProviderCallId) &&
                    string.Equals(
                        command.ExpectedProviderCallId,
                        CentrexEventParser.SafeToken(
                            command.ExpectedProviderCallId,
                            100),
                        StringComparison.Ordinal);
            }
            Guid endpointId;
            if (string.Equals(command.CommandType, "reset", StringComparison.Ordinal))
            {
                return Guid.TryParse(command.EndpointId, out endpointId) &&
                    string.Equals(
                        command.ExpectedExtension,
                        "0000",
                        StringComparison.Ordinal) &&
                    string.Equals(
                        command.ExpectedLineLast4,
                        "0000",
                        StringComparison.Ordinal);
            }
            return string.Equals(command.CommandType, "provision", StringComparison.Ordinal) &&
                Guid.TryParse(command.EndpointId, out endpointId) &&
                !string.IsNullOrWhiteSpace(command.ExpectedExtension) &&
                command.ExpectedExtension.Length <= 10 &&
                Regex.IsMatch(command.ExpectedExtension, "^[0-9]{2,10}$") &&
                Regex.IsMatch(command.ExpectedLineLast4 ?? string.Empty, "^[0-9]{4}$") &&
                command.CredentialEnvelope != null &&
                string.Equals(
                    command.CredentialEnvelope.Algorithm,
                    "A256CBC-HS256",
                    StringComparison.Ordinal) &&
                !string.IsNullOrWhiteSpace(command.CredentialEnvelope.Iv) &&
                !string.IsNullOrWhiteSpace(command.CredentialEnvelope.Ciphertext) &&
                !string.IsNullOrWhiteSpace(command.CredentialEnvelope.Mac);
        }

        private static bool IsExpired(GatewayBridgeCommand command)
        {
            DateTimeOffset expiresAt;
            return !DateTimeOffset.TryParse(
                command.ExpiresAt,
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out expiresAt) || expiresAt <= DateTimeOffset.UtcNow;
        }

        private static GatewayBridgeCommand ParseCommand(string json)
        {
            Dictionary<string, object> value = new JavaScriptSerializer()
                .DeserializeObject(json) as Dictionary<string, object>;
            if (value == null)
            {
                return null;
            }

            object schemaVersion;
            int parsedVersion;
            if (!value.TryGetValue("schemaVersion", out schemaVersion) ||
                !int.TryParse(
                    Convert.ToString(schemaVersion, CultureInfo.InvariantCulture),
                    NumberStyles.Integer,
                    CultureInfo.InvariantCulture,
                    out parsedVersion))
            {
                return null;
            }
            Dictionary<string, object> envelope = null;
            object envelopeValue;
            if (value.TryGetValue("credentialEnvelope", out envelopeValue))
            {
                envelope = envelopeValue as Dictionary<string, object>;
            }
            return new GatewayBridgeCommand
            {
                SchemaVersion = parsedVersion,
                CommandId = ReadString(value, "commandId"),
                InboundCallId = ReadString(value, "inboundCallId"),
                CommandType = ReadString(value, "commandType"),
                ExpectedProviderCallId = ReadString(
                    value,
                    "expectedProviderCallId"),
                EndpointId = ReadString(value, "endpointId"),
                ExpectedExtension = ReadString(value, "expectedExtension"),
                ExpectedLineLast4 = ReadString(value, "expectedLineLast4"),
                CredentialEnvelope = envelope == null
                    ? null
                    : new GatewayCredentialEnvelope
                    {
                        Algorithm = ReadString(envelope, "algorithm"),
                        Iv = ReadString(envelope, "iv"),
                        Ciphertext = ReadString(envelope, "ciphertext"),
                        Mac = ReadString(envelope, "mac")
                    },
                ExpiresAt = ReadString(value, "expiresAt")
            };
        }

        private static string ReadString(
            IDictionary<string, object> value,
            string key)
        {
            object result;
            return value.TryGetValue(key, out result) && result is string
                ? (string)result
                : null;
        }

        private static string CreateNonce()
        {
            byte[] value = new byte[16];
            using (RandomNumberGenerator random = RandomNumberGenerator.Create())
            {
                random.GetBytes(value);
            }
            return Convert.ToBase64String(value)
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
        }

        private static byte[] Sha256(byte[] value)
        {
            using (SHA256 algorithm = SHA256.Create())
            {
                return algorithm.ComputeHash(value);
            }
        }

        private static string Hex(byte[] value)
        {
            StringBuilder result = new StringBuilder(value.Length * 2);
            for (int index = 0; index < value.Length; index++)
            {
                result.Append(value[index].ToString("x2", CultureInfo.InvariantCulture));
            }
            return result.ToString();
        }

        private static void Clear(byte[] value)
        {
            if (value != null)
            {
                Array.Clear(value, 0, value.Length);
            }
        }

        private void ThrowIfDisposed()
        {
            if (_disposed)
            {
                throw new ObjectDisposedException("GatewayCommandPoller");
            }
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }
            _disposed = true;
            _timer.Dispose();
            _httpClient.Dispose();
        }

        private sealed class PendingCompletion
        {
            public PendingCompletion(
                GatewayBridgeCommand command,
                bool succeeded,
                string resultCode)
            {
                Command = command;
                Succeeded = succeeded;
                ResultCode = resultCode;
            }

            public GatewayBridgeCommand Command { get; private set; }
            public bool Succeeded { get; private set; }
            public string ResultCode { get; private set; }
        }
    }
}
