using System;
using System.Drawing;
using System.Windows.Forms;

namespace Lawand.CentrexBridge
{
    internal sealed class BridgeApplicationContext : ApplicationContext
    {
        private readonly BridgeConfiguration _configuration;
        private readonly SafeLogger _logger;
        private readonly CentrexActiveXHost _activeXHost;
        private readonly StatusForm _statusForm;
        private readonly NotifyIcon _notifyIcon;
        private readonly CentrexRuntime _runtime;
        private readonly GatewayEventDispatcher _gatewayDispatcher;
        private readonly GatewayCommandPoller _gatewayCommandPoller;
        private bool _exiting;

        public BridgeApplicationContext(BridgeConfiguration configuration)
        {
            _configuration = configuration;
            _logger = new SafeLogger(
                configuration.DataDirectory,
                configuration.LogRetentionDays);
            _activeXHost = new CentrexActiveXHost();
            _activeXHost.Location = new Point(0, 0);
            _activeXHost.Size = new Size(1, 1);
            _activeXHost.TabStop = false;

            _statusForm = new StatusForm(configuration);
            _statusForm.Controls.Add(_activeXHost);
            _statusForm.ReconnectRequested += ReconnectRequested;
            _statusForm.DisconnectRequested += DisconnectRequested;

            if (configuration.TrayIconEnabled)
            {
                _notifyIcon = new NotifyIcon();
                _notifyIcon.Icon = SystemIcons.Application;
                _notifyIcon.Text = "Lawand Centrex Bridge · 시작 중";
                _notifyIcon.Visible = true;
                _notifyIcon.DoubleClick += NotifyIconDoubleClick;
                _notifyIcon.ContextMenuStrip = CreateTrayMenu();
            }

            _runtime = new CentrexRuntime(configuration, _logger, _activeXHost);
            _gatewayDispatcher = new GatewayEventDispatcher(configuration, _logger);
            _gatewayCommandPoller = new GatewayCommandPoller(configuration, _logger);
            _runtime.StatusChanged += RuntimeStatusChanged;
            _runtime.InboundRingReceived += RuntimeInboundRingReceived;
            _runtime.GatewayEventReady += RuntimeGatewayEventReady;
            _runtime.ProvisioningCompleted += RuntimeProvisioningCompleted;
            _gatewayCommandPoller.CommandReceived += GatewayCommandReceived;
            _logger.EntryWritten += LoggerEntryWritten;

            _statusForm.Shown += StatusFormShown;
            _statusForm.Show();
            _statusForm.HideToTray();
        }

        private ContextMenuStrip CreateTrayMenu()
        {
            ContextMenuStrip menu = new ContextMenuStrip();
            ToolStripMenuItem status = new ToolStripMenuItem("상태 열기");
            status.Click += NotifyIconDoubleClick;
            menu.Items.Add(status);

            ToolStripMenuItem reconnect = new ToolStripMenuItem("지금 재연결");
            reconnect.Click += ReconnectRequested;
            menu.Items.Add(reconnect);

            menu.Items.Add(new ToolStripSeparator());
            ToolStripMenuItem exit = new ToolStripMenuItem("브리지 종료");
            exit.Click += ExitRequested;
            menu.Items.Add(exit);
            return menu;
        }

        private void StatusFormShown(object sender, EventArgs eventArgs)
        {
            _statusForm.Shown -= StatusFormShown;
            try
            {
                _gatewayDispatcher.Start();
                _gatewayCommandPoller.Start();
                _runtime.Start();
            }
            catch (Exception exception)
            {
                _logger.Error("BRIDGE_START_FAILED", exception);
                _statusForm.UpdateStatus(new BridgeStatusEventArgs(
                    BridgeConnectionState.ConfigurationError,
                    "ActiveX 초기화에 실패했습니다. OCX 등록 상태를 확인하세요."));
            }
        }

        private void GatewayCommandReceived(
            object sender,
            GatewayBridgeCommandEventArgs eventArgs)
        {
            try
            {
                _statusForm.BeginInvoke(new Action(() =>
                {
                    string reason;
                    bool accepted;
                    try
                    {
                        if (string.Equals(
                            eventArgs.Command.CommandType,
                            "provision",
                            StringComparison.Ordinal))
                        {
                            accepted = _runtime.TryProvision(
                                eventArgs.Command,
                                out reason);
                        }
                        else if (string.Equals(
                            eventArgs.Command.CommandType,
                            "reset",
                            StringComparison.Ordinal))
                        {
                            accepted = _runtime.TryResetToIdle(
                                eventArgs.Command,
                                out reason);
                        }
                        else
                        {
                            accepted = _runtime.TryAnswer(
                                eventArgs.Command.ExpectedProviderCallId,
                                out reason);
                        }
                    }
                    catch (Exception exception)
                    {
                        _logger.Error("GATEWAY_COMMAND_FAILED", exception);
                        accepted = false;
                        reason = string.Equals(
                            eventArgs.Command.CommandType,
                            "provision",
                            StringComparison.Ordinal)
                                ? "provision_exception"
                                : string.Equals(
                                    eventArgs.Command.CommandType,
                                    "reset",
                                    StringComparison.Ordinal)
                                    ? "reset_exception"
                                    : "answer_exception";
                    }

                    if (!accepted ||
                        !string.Equals(
                            eventArgs.Command.CommandType,
                            "provision",
                            StringComparison.Ordinal))
                    {
                        bool succeeded = accepted || string.Equals(
                            reason,
                            "already_answered",
                            StringComparison.Ordinal);
                        _gatewayCommandPoller.Complete(
                            eventArgs.Command,
                            succeeded,
                            reason);
                    }
                }));
            }
            catch (InvalidOperationException exception)
            {
                _logger.Error("GATEWAY_COMMAND_DISPATCH_FAILED", exception);
                _gatewayCommandPoller.Complete(
                    eventArgs.Command,
                    false,
                    "ui_dispatch_unavailable");
            }
        }

        private void RuntimeProvisioningCompleted(
            object sender,
            BridgeProvisioningEventArgs eventArgs)
        {
            _gatewayCommandPoller.Complete(
                eventArgs.Command,
                eventArgs.Succeeded,
                eventArgs.ResultCode);
        }

        private void RuntimeGatewayEventReady(
            object sender,
            GatewayEventPayloadEventArgs eventArgs)
        {
            try
            {
                _gatewayDispatcher.Enqueue(eventArgs.Payload);
            }
            catch (Exception exception)
            {
                _logger.Error("GATEWAY_EVENT_QUEUE_FAILED", exception);
            }
        }

        private void RuntimeStatusChanged(object sender, BridgeStatusEventArgs eventArgs)
        {
            _statusForm.UpdateStatus(eventArgs);
            string state = eventArgs.State.ToString();
            if (_notifyIcon != null)
            {
                _notifyIcon.Text = Truncate(
                    "Lawand Centrex Bridge · " + state,
                    63);
            }
        }

        private void RuntimeInboundRingReceived(object sender, InboundRingEventArgs eventArgs)
        {
            _statusForm.ShowInboundRing(eventArgs);
            if (_notifyIcon != null)
            {
                _notifyIcon.ShowBalloonTip(
                    5000,
                    "수신전화 감지",
                    eventArgs.MaskedCaller + " 번호에서 전화가 왔습니다.",
                    ToolTipIcon.Info);
            }
        }

        private void LoggerEntryWritten(object sender, SafeLogEventArgs eventArgs)
        {
            _statusForm.AppendLog(eventArgs.Line);
        }

        private void ReconnectRequested(object sender, EventArgs eventArgs)
        {
            try
            {
                _runtime.ReconnectNow();
            }
            catch (Exception exception)
            {
                _logger.Error("MANUAL_RECONNECT_FAILED", exception);
            }
        }

        private void DisconnectRequested(object sender, EventArgs eventArgs)
        {
            try
            {
                _runtime.Disconnect();
            }
            catch (Exception exception)
            {
                _logger.Error("MANUAL_DISCONNECT_FAILED", exception);
            }
        }

        private void NotifyIconDoubleClick(object sender, EventArgs eventArgs)
        {
            _statusForm.ShowFromTray();
        }

        private void ExitRequested(object sender, EventArgs eventArgs)
        {
            if (_exiting)
            {
                return;
            }

            DialogResult result = MessageBox.Show(
                "센트릭스 수신 브리지를 종료할까요?",
                "Lawand Centrex Bridge",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (result != DialogResult.Yes)
            {
                return;
            }

            _exiting = true;
            ExitThread();
        }

        protected override void ExitThreadCore()
        {
            _exiting = true;
            if (_notifyIcon != null)
            {
                _notifyIcon.Visible = false;
            }
            _runtime.Dispose();
            _gatewayDispatcher.Dispose();
            _gatewayCommandPoller.Dispose();
            if (_notifyIcon != null)
            {
                _notifyIcon.Dispose();
            }
            _statusForm.Dispose();
            _logger.Dispose();
            base.ExitThreadCore();
        }

        private static string Truncate(string value, int maximumLength)
        {
            return value.Length <= maximumLength
                ? value
                : value.Substring(0, maximumLength);
        }
    }
}
