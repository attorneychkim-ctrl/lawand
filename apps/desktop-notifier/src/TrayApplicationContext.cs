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
        private readonly NotificationPopupManager popupManager;
        private readonly UserPresenceMonitor presenceMonitor;
        private readonly NotifyIcon notifyIcon;
        private readonly Icon applicationIcon;
        private readonly ToolStripMenuItem statusMenuItem;
        private readonly ToolStripMenuItem disconnectMenuItem;
        private readonly Control dispatcher;
        private StoredCredential credential;
        private bool exiting;

        public TrayApplicationContext()
        {
            configuration = NotifierConfiguration.Load();
            gatewayClient = new GatewayClient();
            poller = new NotificationPoller(gatewayClient, configuration);
            popupManager = new NotificationPopupManager();
            presenceMonitor = new UserPresenceMonitor(
                TimeSpan.FromMinutes(configuration.AwayAfterMinutes));
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
            applicationIcon = LoadApplicationIcon();
            notifyIcon.Icon = applicationIcon;
            notifyIcon.Text = "LAW& OS 알림";
            notifyIcon.ContextMenuStrip = menu;
            notifyIcon.Visible = true;
            notifyIcon.DoubleClick += delegate { OpenErpSettings(); };

            popupManager.DeliveryOpenRequested += OpenDelivery;
            popupManager.ErpOpenRequested += OpenErpHome;
            popupManager.SettingsOpenRequested += OpenErpSettings;
            presenceMonitor.AwayChanged += PresenceAwayChanged;

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
            dispatcher.BeginInvoke(new Action(StartApplication));
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                SystemEvents.SessionSwitch -= SystemEventsSessionSwitch;
                poller.Dispose();
                gatewayClient.Dispose();
                presenceMonitor.Dispose();
                popupManager.Dispose();
                notifyIcon.Visible = false;
                notifyIcon.Dispose();
                applicationIcon.Dispose();
                dispatcher.Dispose();
            }
            base.Dispose(disposing);
        }

        private static Icon LoadApplicationIcon()
        {
            try
            {
                Icon icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (icon != null)
                {
                    return icon;
                }
            }
            catch
            {
                // 실행 파일 아이콘 추출 실패 시 Windows 기본 정보 아이콘을 복제한다.
            }
            return (Icon)SystemIcons.Information.Clone();
        }

        private void StartApplication()
        {
            presenceMonitor.Start();
            StartOrRequestPairing();
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
                    popupManager.ShowSystemMessage(
                        "LAW& OS 알림 연결 완료",
                        "ERP에서 테스트 알림을 보내 우측 상단 업무 카드를 확인해 주세요.",
                        false);
                }
            }
        }

        private void HandleDelivery(DesktopDelivery delivery)
        {
            if (delivery == null || delivery.payload == null || credential == null)
            {
                return;
            }
            presenceMonitor.Refresh();
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
            popupManager.ShowDelivery(
                delivery,
                DeliveryDispositionPolicy.ContentForDisplay(
                    delivery.payload.body,
                    false,
                    configuration.HideContentWhenLocked));
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

        private void OpenDelivery(DesktopDelivery delivery)
        {
            if (delivery == null ||
                delivery.payload == null ||
                !UrlSafety.IsAllowedErpDeepLink(
                    delivery.payload.deepLink,
                    configuration.ErpBaseUrl))
            {
                return;
            }
            try
            {
                OpenUrl(delivery.payload.deepLink);
                AcknowledgeSafe(delivery.deliveryId, "opened");
            }
            catch
            {
                popupManager.ShowSystemMessage(
                    "ERP 화면을 열지 못했습니다",
                    "트레이 메뉴에서 ERP PC 알림 설정을 열어 다시 시도해 주세요.",
                    true);
            }
        }

        private void OpenErpSettings()
        {
            TryOpenErp(configuration.ErpBaseUrl + "/desktop-notifications");
        }

        private void OpenErpHome()
        {
            TryOpenErp(configuration.ErpBaseUrl);
        }

        private void TryOpenErp(string url)
        {
            try
            {
                OpenUrl(url);
            }
            catch
            {
                popupManager.ShowSystemMessage(
                    "ERP 화면을 열지 못했습니다",
                    "브라우저 상태를 확인한 뒤 트레이 메뉴에서 다시 열어 주세요.",
                    true);
            }
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
            popupManager.Clear();
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
            disconnectMenuItem.Enabled = false;
            popupManager.Clear();
            SetStatus("연결 해제됨");
            popupManager.ShowSystemMessage(
                "LAW& OS 알림 연결 확인 필요",
                "ERP의 PC 알림 설정에서 이 컴퓨터를 다시 연결해 주세요.",
                true);
        }

        private void SystemEventsSessionSwitch(
            object sender,
            SessionSwitchEventArgs eventArgs)
        {
            if (eventArgs.Reason == SessionSwitchReason.SessionLock)
            {
                Dispatch(delegate { presenceMonitor.SetSessionLocked(true); });
            }
            else if (eventArgs.Reason == SessionSwitchReason.SessionUnlock)
            {
                Dispatch(delegate { presenceMonitor.SetSessionLocked(false); });
            }
        }

        private void PresenceAwayChanged(bool away)
        {
            if (away)
            {
                popupManager.SuspendForAway();
            }
            else
            {
                popupManager.ResumeFromAway();
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
            popupManager.Clear();
            notifyIcon.Visible = false;
            ExitThread();
        }
    }
}
