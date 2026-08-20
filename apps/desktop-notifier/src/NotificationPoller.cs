using System;
using System.Threading;
using System.Threading.Tasks;

namespace Lawand.DesktopNotifier
{
    internal sealed class NotificationPoller : IDisposable
    {
        private readonly GatewayClient gatewayClient;
        private readonly NotifierConfiguration configuration;
        private CancellationTokenSource cancellation;
        private Task worker;

        public NotificationPoller(
            GatewayClient gatewayClient,
            NotifierConfiguration configuration)
        {
            this.gatewayClient = gatewayClient;
            this.configuration = configuration;
        }

        public event Action<DesktopDelivery> DeliveryReceived;
        public event Action<string> StatusChanged;
        public event Action AuthenticationLost;

        public void Start(string deviceToken)
        {
            Stop();
            cancellation = new CancellationTokenSource();
            CancellationToken token = cancellation.Token;
            worker = Task.Run(() => RunAsync(deviceToken, token), token);
        }

        public void Stop()
        {
            if (cancellation != null)
            {
                cancellation.Cancel();
                cancellation.Dispose();
                cancellation = null;
            }
            worker = null;
        }

        public void Dispose()
        {
            Stop();
        }

        private async Task RunAsync(string deviceToken, CancellationToken token)
        {
            int failureCount = 0;
            RaiseStatus("알림 서버 연결 중");
            while (!token.IsCancellationRequested)
            {
                bool shouldDelayAfterFailure = false;
                try
                {
                    DesktopDelivery delivery = await gatewayClient.PollAsync(
                        configuration.GatewayBaseUrl,
                        deviceToken,
                        token);
                    failureCount = 0;
                    RaiseStatus("연결됨");
                    if (delivery != null)
                    {
                        Action<DesktopDelivery> handler = DeliveryReceived;
                        if (handler != null)
                        {
                            handler(delivery);
                        }
                    }
                    await Task.Delay(TimeSpan.FromSeconds(5), token);
                }
                catch (GatewayClientException exception)
                {
                    if (exception.StatusCode == 401)
                    {
                        RaiseStatus("연결 해제됨");
                        Action authenticationLost = AuthenticationLost;
                        if (authenticationLost != null)
                        {
                            authenticationLost();
                        }
                        return;
                    }
                    failureCount++;
                    RaiseStatus("재연결 대기");
                    shouldDelayAfterFailure = true;
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch
                {
                    failureCount++;
                    RaiseStatus("재연결 대기");
                    shouldDelayAfterFailure = true;
                }

                if (shouldDelayAfterFailure)
                {
                    try
                    {
                        await DelayAfterFailure(failureCount, token);
                    }
                    catch (OperationCanceledException)
                    {
                        return;
                    }
                }
            }
        }

        private static Task DelayAfterFailure(int failureCount, CancellationToken token)
        {
            int exponent = Math.Min(failureCount, 5);
            int seconds = Math.Min(60, (int)Math.Pow(2, exponent));
            return Task.Delay(TimeSpan.FromSeconds(seconds), token);
        }

        private void RaiseStatus(string status)
        {
            Action<string> handler = StatusChanged;
            if (handler != null)
            {
                handler(status);
            }
        }
    }
}
