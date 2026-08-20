using System;
using System.Diagnostics;
using System.Drawing;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Lawand.DesktopNotifier
{
    internal sealed class TrayApplicationContext : ApplicationContext
    {
        private readonly NotifierConfiguration configuration;
        private readonly GatewayClient gatewayClient;
        private readonly NotificationPoller poller;
        private readonly NotifyIcon notifyIcon;
        private readonly ToolStripMenuItem statusMenuItem;
        private readonly ToolStripMenuItem disconnectMenuItem;
        private readonly Control dispatcher;
        private StoredCredential credential;
        private DesktopDelivery currentDelivery;
        private bool sessionLocked;
        private bool exiting;

        public TrayApplicationContext()
        {
            configuration = NotifierConfiguration.Load();
            gatewayClient = new GatewayClient();
            poller = new NotificationPoller(gatewayClient, configuration);
            dispatcher = new Control();
            IntPtr dispatcherHandle = dispatcher.Handle;

            statusMenuItem = new ToolStripMenuItem("상태: 시작 중");
            statusMenuItem.Enabled = false;
            ToolStripMenuItem openErpMenuItem = new ToolStripMenuItem(
                "ERP PC 알림 설정 열기");
            openErpMenuItem.Click += delegate { OpenErpSettings(); };
            ToolStripMenuItem pairingMenuItem = new ToolStripMenuItem(
                "연결 코드 입력");
            pairingMenuItem.Click += delegate { ShowPairingForm(); };
            disconnectMenuItem = new ToolStripMenuItem("이 컴퓨터 연결 해제");
            disconnectMenuItem.Click += DisconnectMenuItemClick;
            ToolStripMenuItem exitMenuItem = new ToolStripMenuItem("종료");
            exitMenuItem.Click += delegate { ExitApplication(); };

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add(statusMenuItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(openErpMenuItem);
            menu.Items.Add(pairingMenuItem);
            menu.Items.Add(disconnectMenuItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(exitMenuItem);

            notifyIcon = new NotifyIcon();
            notifyIcon.Icon = SystemIcons.Information;
            notifyIcon.Text = "LAW& OS 알림";
            notifyIcon.ContextMenuStrip = menu;
            notifyIcon.Visible = true;
            notifyIcon.DoubleClick += delegate { OpenErpSettings(); };
            notifyIcon.BalloonTipClicked += BalloonTipClicked;

            poller.DeliveryReceived += delivery => Dispatch(delegate
            {
                HandleDelivery(delivery);
            });
            poller.StatusChanged += status => Dispatch(delegate
            {
                SetStatus(status);
            });
            poller.AuthenticationLost += () => Dispatch(HandleAuthenticationLost);
            SystemEvents.SessionSwitch += SystemEventsSessionSwitch;

            disconnectMenuItem.Enabled = false;
            dispatcher.BeginInvoke(new Action(StartOrRequestPairing));
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                SystemEvents.SessionSwitch -= SystemEventsSessionSwitch;
                poller.Dispose();
                gatewayClient.Dispose();
                notifyIcon.Visible = false;
                notifyIcon.Dispose();
                dispatcher.Dispose();
            }
            base.Dispose(disposing);
        }

        private void StartOrRequestPairing()
        {
            StoredCredential stored;
            if (CredentialStore.TryRead(configuration.CredentialTarget, out stored) &&
                !string.IsNullOrWhiteSpace(configuration.DeviceId) &&
                string.Equals(
                    stored.UserName,
                    configuration.DeviceId,
                    StringComparison.OrdinalIgnoreCase))
            {
                credential = stored;
                disconnectMenuItem.Enabled = true;
                poller.Start(credential.Secret);
                return;
            }

            credential = null;
            disconnectMenuItem.Enabled = false;
            SetStatus("연결 전");
            ShowPairingForm();
        }

        private void ShowPairingForm()
        {
            using (PairingForm form = new PairingForm(configuration, gatewayClient))
            {
                if (form.ShowDialog() == DialogResult.OK)
                {
                    StartOrRequestPairing();
                    currentDelivery = null;
                    notifyIcon.BalloonTipTitle = "LAW& OS 알림 연결 완료";
                    notifyIcon.BalloonTipText =
                        "ERP에서 테스트 알림을 보내 Windows 알림을 확인해 주세요.";
                    notifyIcon.BalloonTipIcon = ToolTipIcon.Info;
                    notifyIcon.ShowBalloonTip(8000);
                }
            }
        }

        private void HandleDelivery(DesktopDelivery delivery)
        {
            if (delivery == null || delivery.payload == null || credential == null)
            {
                return;
            }
            if (DeliveryDispositionPolicy.AlreadyDisplayed(
                configuration.RecentlyDisplayedDeliveryIds,
                delivery.deliveryId))
            {
                AcknowledgeSafe(delivery.deliveryId, "displayed");
                return;
            }

            try
            {
                configuration.RememberDelivery(delivery.deliveryId);
            }
            catch
            {
                // 로컬 중복 원장 저장 실패가 알림 수신 자체를 막지는 않는다.
            }
            currentDelivery = delivery;
            notifyIcon.BalloonTipTitle = delivery.payload.title;
            notifyIcon.BalloonTipText = DeliveryDispositionPolicy.ContentForDisplay(
                delivery.payload.body,
                sessionLocked,
                configuration.HideContentWhenLocked);
            notifyIcon.BalloonTipIcon = ToolTipIcon.Info;
            notifyIcon.ShowBalloonTip(10000);
            AcknowledgeSafe(delivery.deliveryId, "displayed");
        }

        private async void AcknowledgeSafe(string deliveryId, string outcome)
        {
            if (credential == null)
            {
                return;
            }
            try
            {
                await gatewayClient.AcknowledgeAsync(
                    configuration.GatewayBaseUrl,
                    credential.Secret,
                    deliveryId,
                    outcome,
                    CancellationToken.None);
            }
            catch
            {
                // 다음 polling에서 같은 delivery를 받으면 로컬 원장으로 중복 표시를 막고 재확인한다.
            }
        }

        private void BalloonTipClicked(object sender, EventArgs eventArgs)
        {
            DesktopDelivery delivery = currentDelivery;
            currentDelivery = null;
            if (delivery == null ||
                delivery.payload == null ||
                !UrlSafety.IsAllowedErpDeepLink(
                    delivery.payload.deepLink,
                    configuration.ErpBaseUrl))
            {
                return;
            }
            OpenUrl(delivery.payload.deepLink);
            AcknowledgeSafe(delivery.deliveryId, "opened");
        }

        private void OpenErpSettings()
        {
            OpenUrl(configuration.ErpBaseUrl + "/desktop-notifications");
        }

        private static void OpenUrl(string url)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo(url);
            startInfo.UseShellExecute = true;
            Process.Start(startInfo);
        }

        private async void DisconnectMenuItemClick(object sender, EventArgs eventArgs)
        {
            if (credential == null)
            {
                return;
            }
            DialogResult confirmation = MessageBox.Show(
                "이 컴퓨터의 PC 알림 연결을 해제할까요?",
                "LAW& OS 알림",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (confirmation != DialogResult.Yes)
            {
                return;
            }

            disconnectMenuItem.Enabled = false;
            poller.Stop();
            try
            {
                using (CancellationTokenSource timeout =
                    new CancellationTokenSource(TimeSpan.FromSeconds(10)))
                {
                    await gatewayClient.DisconnectAsync(
                        configuration.GatewayBaseUrl,
                        credential.Secret,
                        timeout.Token);
                }
            }
            catch
            {
                // 서버가 닿지 않아도 이 PC의 인증정보는 즉시 제거한다.
            }
            CredentialStore.Delete(configuration.CredentialTarget);
            configuration.ClearDevice();
            credential = null;
            SetStatus("연결 전");
        }

        private void HandleAuthenticationLost()
        {
            poller.Stop();
            try
            {
                CredentialStore.Delete(configuration.CredentialTarget);
                configuration.ClearDevice();
            }
            catch
            {
                // 상태 표시는 유지하고 사용자가 ERP에서 다시 연결할 수 있게 한다.
            }
            credential = null;
            currentDelivery = null;
            disconnectMenuItem.Enabled = false;
            SetStatus("연결 해제됨");
            notifyIcon.BalloonTipTitle = "LAW& OS 알림 연결 확인 필요";
            notifyIcon.BalloonTipText =
                "ERP의 PC 알림 설정에서 이 컴퓨터를 다시 연결해 주세요.";
            notifyIcon.BalloonTipIcon = ToolTipIcon.Warning;
            notifyIcon.ShowBalloonTip(8000);
        }

        private void SystemEventsSessionSwitch(
            object sender,
            SessionSwitchEventArgs eventArgs)
        {
            if (eventArgs.Reason == SessionSwitchReason.SessionLock)
            {
                sessionLocked = true;
            }
            else if (eventArgs.Reason == SessionSwitchReason.SessionUnlock)
            {
                sessionLocked = false;
            }
        }

        private void SetStatus(string status)
        {
            statusMenuItem.Text = "상태: " + status;
            notifyIcon.Text = ("LAW& OS 알림 · " + status).Substring(
                0,
                Math.Min(63, ("LAW& OS 알림 · " + status).Length));
        }

        private void Dispatch(Action action)
        {
            if (exiting || dispatcher.IsDisposed)
            {
                return;
            }
            try
            {
                dispatcher.BeginInvoke(action);
            }
            catch (InvalidOperationException)
            {
                // 프로그램 종료 중 들어온 마지막 callback은 버린다.
            }
        }

        private void ExitApplication()
        {
            exiting = true;
            poller.Stop();
            notifyIcon.Visible = false;
            ExitThread();
        }
    }
}
