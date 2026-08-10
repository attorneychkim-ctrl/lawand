using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Lawand.CentrexBridge
{
    internal sealed class GatewayEventDispatcher : IDisposable
    {
        private static readonly DateTimeOffset UnixEpoch =
            new DateTimeOffset(1970, 1, 1, 0, 0, 0, TimeSpan.Zero);

        private readonly BridgeConfiguration _configuration;
        private readonly SafeLogger _logger;
        private readonly string _queueDirectory;
        private readonly string _deadLetterDirectory;
        private readonly HttpClient _httpClient;
        private readonly Timer _timer;
        private int _processing;
        private bool _disposed;

        public GatewayEventDispatcher(
            BridgeConfiguration configuration,
            SafeLogger logger)
        {
            _configuration = configuration;
            _logger = logger;
            _queueDirectory = Path.Combine(
                configuration.DataDirectory,
                "gateway-queue");
            _deadLetterDirectory = Path.Combine(
                configuration.DataDirectory,
                "gateway-dead-letter");
            Directory.CreateDirectory(_queueDirectory);
            Directory.CreateDirectory(_deadLetterDirectory);
            _httpClient = new HttpClient(new HttpClientHandler
            {
                UseProxy = false
            });
            _httpClient.Timeout = TimeSpan.FromSeconds(configuration.GatewayTimeoutSeconds);
            _timer = new Timer(ProcessTimer, null, Timeout.Infinite, Timeout.Infinite);
            DeleteExpiredEvents();
        }

        public void Start()
        {
            ThrowIfDisposed();
            _timer.Change(500, _configuration.GatewayRetrySeconds * 1000);
        }

        public void Enqueue(GatewayEventPayload payload)
        {
            ThrowIfDisposed();
            byte[] plain = Encoding.UTF8.GetBytes(payload.ToJson());
            byte[] encrypted = null;
            try
            {
                encrypted = ProtectedData.Protect(
                    plain,
                    null,
                    DataProtectionScope.CurrentUser);
                string fileName = DateTimeOffset.UtcNow.UtcDateTime.Ticks.ToString(
                    "D19",
                    CultureInfo.InvariantCulture) + "-" + payload.EventId + ".event";
                string target = Path.Combine(_queueDirectory, fileName);
                string temporary = target + ".tmp";
                File.WriteAllBytes(temporary, encrypted);
                File.Move(temporary, target);
                _logger.Info(
                    "GATEWAY_EVENT_QUEUED",
                    "TYPE=" + payload.EventType,
                    "EVENT=" + payload.EventId);
                _timer.Change(0, _configuration.GatewayRetrySeconds * 1000);
            }
            finally
            {
                Clear(plain);
                Clear(encrypted);
            }
        }

        private async void ProcessTimer(object state)
        {
            if (_disposed || Interlocked.Exchange(ref _processing, 1) != 0)
            {
                return;
            }

            try
            {
                string path = Directory.GetFiles(_queueDirectory, "*.event")
                    .OrderBy(value => value, StringComparer.Ordinal)
                    .FirstOrDefault();
                if (path == null)
                {
                    return;
                }
                await Send(path).ConfigureAwait(false);
            }
            catch (Exception exception)
            {
                _logger.Error("GATEWAY_DELIVERY_FAILED", exception);
            }
            finally
            {
                Interlocked.Exchange(ref _processing, 0);
            }
        }

        private async Task Send(string path)
        {
            byte[] encrypted = null;
            byte[] body = null;
            byte[] secret = null;
            try
            {
                encrypted = File.ReadAllBytes(path);
                body = ProtectedData.Unprotect(
                    encrypted,
                    null,
                    DataProtectionScope.CurrentUser);
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
                secret = GatewaySecretEncoding.Decode(credential.Password);

                string timestamp = ((long)(DateTimeOffset.UtcNow - UnixEpoch).TotalSeconds)
                    .ToString(CultureInfo.InvariantCulture);
                string nonce = CreateNonce();
                string bodyHash = Hex(Sha256(body));
                string canonical = string.Join("\n", new[]
                {
                    "v1",
                    "POST",
                    new Uri(_configuration.GatewayUrl).AbsolutePath,
                    _configuration.BridgeId,
                    timestamp,
                    nonce,
                    bodyHash
                });
                string signature;
                using (HMACSHA256 hmac = new HMACSHA256(secret))
                {
                    signature = Hex(hmac.ComputeHash(Encoding.UTF8.GetBytes(canonical)));
                }

                using (HttpRequestMessage request = new HttpRequestMessage(
                    HttpMethod.Post,
                    _configuration.GatewayUrl))
                {
                    request.Content = new ByteArrayContent(body);
                    request.Content.Headers.ContentType =
                        new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
                    request.Headers.Add("x-lawand-bridge-id", _configuration.BridgeId);
                    request.Headers.Add("x-lawand-bridge-timestamp", timestamp);
                    request.Headers.Add("x-lawand-bridge-nonce", nonce);
                    request.Headers.Add("x-lawand-bridge-signature", "v1=" + signature);
                    using (HttpResponseMessage response = await _httpClient
                        .SendAsync(request)
                        .ConfigureAwait(false))
                    {
                        int status = (int)response.StatusCode;
                        if (status == 200 || status == 201)
                        {
                            File.Delete(path);
                            _logger.Info(
                                "GATEWAY_EVENT_SENT",
                                "STATUS=" + status.ToString(CultureInfo.InvariantCulture),
                                "QUEUE=" + QueueCount().ToString(CultureInfo.InvariantCulture));
                            return;
                        }

                        if (GatewayDeliveryDispositionPolicy.ShouldDeadLetter(
                            status,
                            File.GetCreationTimeUtc(path),
                            DateTime.UtcNow))
                        {
                            string target = Path.Combine(
                                _deadLetterDirectory,
                                Path.GetFileName(path));
                            File.Move(path, target);
                            _logger.Warn(
                                "GATEWAY_EVENT_DEAD_LETTERED",
                                "STATUS=" + status.ToString(CultureInfo.InvariantCulture),
                                "QUEUE=" + QueueCount().ToString(CultureInfo.InvariantCulture),
                                "DEAD=" + DeadLetterCount().ToString(CultureInfo.InvariantCulture));
                            return;
                        }

                        _logger.Warn(
                            "GATEWAY_EVENT_RETRY",
                            "STATUS=" + status.ToString(CultureInfo.InvariantCulture));
                    }
                }
            }
            finally
            {
                Clear(encrypted);
                Clear(body);
                Clear(secret);
            }
        }

        private int QueueCount()
        {
            return Directory.GetFiles(_queueDirectory, "*.event").Length;
        }

        private int DeadLetterCount()
        {
            return Directory.GetFiles(
                _deadLetterDirectory,
                "*.event").Length;
        }

        private void DeleteExpiredEvents()
        {
            DateTime threshold = DateTime.UtcNow.AddHours(
                -_configuration.GatewayEventRetentionHours);
            DeleteExpiredEvents(
                _queueDirectory,
                threshold,
                "GATEWAY_EVENT_EXPIRED");
            DeleteExpiredEvents(
                _deadLetterDirectory,
                threshold,
                "GATEWAY_DEAD_LETTER_EXPIRED");
        }

        private void DeleteExpiredEvents(
            string directory,
            DateTime threshold,
            string logEvent)
        {
            foreach (string path in Directory.GetFiles(directory, "*.event"))
            {
                try
                {
                    if (File.GetCreationTimeUtc(path) < threshold)
                    {
                        File.Delete(path);
                        _logger.Warn(logEvent);
                    }
                }
                catch (IOException)
                {
                }
                catch (UnauthorizedAccessException)
                {
                }
            }
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
            if (value == null)
            {
                return;
            }
            Array.Clear(value, 0, value.Length);
        }

        private void ThrowIfDisposed()
        {
            if (_disposed)
            {
                throw new ObjectDisposedException("GatewayEventDispatcher");
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
    }
}
