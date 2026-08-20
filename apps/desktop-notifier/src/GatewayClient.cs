using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Lawand.DesktopNotifier
{
    internal sealed class GatewayClientException : Exception
    {
        public GatewayClientException(int statusCode, string code, string message)
            : base(message)
        {
            StatusCode = statusCode;
            Code = code;
        }

        public int StatusCode { get; private set; }
        public string Code { get; private set; }
    }

    internal sealed class PairingDevice
    {
        public string id { get; set; }
        public string name { get; set; }
        public string platform { get; set; }
        public string appVersion { get; set; }
        public string staffDisplayName { get; set; }
    }

    internal sealed class PairingResult
    {
        public string deviceToken { get; set; }
        public PairingDevice device { get; set; }
        public int pollIntervalSeconds { get; set; }
    }

    internal sealed class DesktopNotificationPayload
    {
        public string title { get; set; }
        public string body { get; set; }
        public string category { get; set; }
        public string deepLink { get; set; }
    }

    internal sealed class DesktopDelivery
    {
        public string deliveryId { get; set; }
        public string notificationId { get; set; }
        public string eventType { get; set; }
        public DesktopNotificationPayload payload { get; set; }
        public string createdAt { get; set; }
        public string expiresAt { get; set; }
    }

    internal sealed class GatewayErrorBody
    {
        public string error { get; set; }
        public string message { get; set; }
    }

    internal sealed class GatewayClient : IDisposable
    {
        private readonly HttpClient client;
        private readonly JavaScriptSerializer serializer;

        public GatewayClient()
        {
            client = new HttpClient();
            client.Timeout = TimeSpan.FromSeconds(20);
            client.DefaultRequestHeaders.UserAgent.ParseAdd(
                "LawandDesktopNotifier/0.1.0");
            serializer = new JavaScriptSerializer();
            serializer.MaxJsonLength = 64 * 1024;
        }

        public async Task<PairingResult> PairAsync(
            string gatewayBaseUrl,
            string pairingCode,
            string deviceName,
            CancellationToken cancellationToken)
        {
            object body = new
            {
                pairingCode = pairingCode,
                deviceName = deviceName,
                platform = "windows",
                appVersion = "0.1.0"
            };
            using (HttpRequestMessage request = JsonRequest(
                HttpMethod.Post,
                gatewayBaseUrl + "/v1/desktop-notifications/pair",
                body,
                null))
            using (HttpResponseMessage response = await client.SendAsync(
                request,
                HttpCompletionOption.ResponseContentRead,
                cancellationToken))
            {
                string responseBody = await response.Content.ReadAsStringAsync();
                EnsureSuccess(response, responseBody);
                PairingResult result = serializer.Deserialize<PairingResult>(responseBody);
                if (result == null ||
                    string.IsNullOrWhiteSpace(result.deviceToken) ||
                    result.device == null ||
                    string.IsNullOrWhiteSpace(result.device.id))
                {
                    throw new InvalidOperationException("PC 연결 응답 형식이 올바르지 않습니다.");
                }
                return result;
            }
        }

        public async Task<DesktopDelivery> PollAsync(
            string gatewayBaseUrl,
            string deviceToken,
            CancellationToken cancellationToken)
        {
            using (HttpRequestMessage request = new HttpRequestMessage(
                HttpMethod.Get,
                gatewayBaseUrl + "/v1/desktop-notifications/poll"))
            {
                request.Headers.Add("x-lawand-desktop-token", deviceToken);
                using (HttpResponseMessage response = await client.SendAsync(
                    request,
                    HttpCompletionOption.ResponseContentRead,
                    cancellationToken))
                {
                    if (response.StatusCode == HttpStatusCode.NoContent)
                    {
                        return null;
                    }
                    string responseBody = await response.Content.ReadAsStringAsync();
                    EnsureSuccess(response, responseBody);
                    DesktopDelivery delivery = serializer.Deserialize<DesktopDelivery>(responseBody);
                    if (delivery == null ||
                        string.IsNullOrWhiteSpace(delivery.deliveryId) ||
                        delivery.payload == null ||
                        string.IsNullOrWhiteSpace(delivery.payload.title))
                    {
                        throw new InvalidOperationException("PC 알림 응답 형식이 올바르지 않습니다.");
                    }
                    return delivery;
                }
            }
        }

        public async Task AcknowledgeAsync(
            string gatewayBaseUrl,
            string deviceToken,
            string deliveryId,
            string outcome,
            CancellationToken cancellationToken)
        {
            object body = new { deliveryId = deliveryId, outcome = outcome };
            using (HttpRequestMessage request = JsonRequest(
                HttpMethod.Post,
                gatewayBaseUrl + "/v1/desktop-notifications/ack",
                body,
                deviceToken))
            using (HttpResponseMessage response = await client.SendAsync(
                request,
                HttpCompletionOption.ResponseContentRead,
                cancellationToken))
            {
                string responseBody = await response.Content.ReadAsStringAsync();
                EnsureSuccess(response, responseBody);
            }
        }

        public async Task DisconnectAsync(
            string gatewayBaseUrl,
            string deviceToken,
            CancellationToken cancellationToken)
        {
            using (HttpRequestMessage request = JsonRequest(
                HttpMethod.Post,
                gatewayBaseUrl + "/v1/desktop-notifications/disconnect",
                null,
                deviceToken))
            using (HttpResponseMessage response = await client.SendAsync(
                request,
                HttpCompletionOption.ResponseContentRead,
                cancellationToken))
            {
                string responseBody = await response.Content.ReadAsStringAsync();
                EnsureSuccess(response, responseBody);
            }
        }

        public void Dispose()
        {
            client.Dispose();
        }

        private HttpRequestMessage JsonRequest(
            HttpMethod method,
            string url,
            object body,
            string deviceToken)
        {
            HttpRequestMessage request = new HttpRequestMessage(method, url);
            if (!string.IsNullOrWhiteSpace(deviceToken))
            {
                request.Headers.Add("x-lawand-desktop-token", deviceToken);
            }
            if (body != null)
            {
                request.Content = new StringContent(
                    serializer.Serialize(body),
                    Encoding.UTF8,
                    "application/json");
            }
            return request;
        }

        private void EnsureSuccess(HttpResponseMessage response, string responseBody)
        {
            if (response.IsSuccessStatusCode)
            {
                return;
            }
            GatewayErrorBody error = null;
            try
            {
                error = serializer.Deserialize<GatewayErrorBody>(responseBody);
            }
            catch
            {
                // 응답 본문이나 인증 토큰을 로그에 남기지 않고 일반 오류로 처리한다.
            }
            throw new GatewayClientException(
                (int)response.StatusCode,
                error != null && !string.IsNullOrWhiteSpace(error.error)
                    ? error.error
                    : "gateway_error",
                error != null && !string.IsNullOrWhiteSpace(error.message)
                    ? error.message
                    : "PC 알림 서버 요청에 실패했습니다.");
        }
    }
}
