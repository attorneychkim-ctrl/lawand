using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace Lawand.CentrexBridge
{
    internal sealed class StatusForm : Form
    {
        private readonly Label _stateLabel;
        private readonly Label _messageLabel;
        private readonly Label _lastRingLabel;
        private readonly TextBox _logBox;
        private readonly Button _reconnectButton;
        private readonly Button _disconnectButton;

        public StatusForm(BridgeConfiguration configuration)
        {
            Text = "Lawand Centrex Bridge";
            ClientSize = new Size(690, 450);
            MinimumSize = new Size(580, 390);
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Malgun Gothic", 9F);
            ShowInTaskbar = false;

            Label title = new Label();
            title.Text = "센트릭스 수신 브리지";
            title.Font = new Font(Font.FontFamily, 15F, FontStyle.Bold);
            title.Location = new Point(20, 18);
            title.AutoSize = true;
            Controls.Add(title);

            Label identity = new Label();
            identity.Text = "브리지 " + configuration.BridgeId + " · 내선 끝 " +
                LastFour(configuration.ExpectedExtension);
            identity.ForeColor = Color.DimGray;
            identity.Location = new Point(22, 52);
            identity.AutoSize = true;
            Controls.Add(identity);

            _stateLabel = new Label();
            _stateLabel.Text = "시작 중";
            _stateLabel.Font = new Font(Font.FontFamily, 11F, FontStyle.Bold);
            _stateLabel.Location = new Point(22, 84);
            _stateLabel.AutoSize = true;
            Controls.Add(_stateLabel);

            _messageLabel = new Label();
            _messageLabel.Text = "ActiveX를 준비하고 있습니다.";
            _messageLabel.Location = new Point(22, 112);
            _messageLabel.Size = new Size(640, 24);
            Controls.Add(_messageLabel);

            _lastRingLabel = new Label();
            _lastRingLabel.Text = "최근 수신: 없음";
            _lastRingLabel.Location = new Point(22, 145);
            _lastRingLabel.Size = new Size(640, 24);
            Controls.Add(_lastRingLabel);

            _reconnectButton = new Button();
            _reconnectButton.Text = "지금 재연결";
            _reconnectButton.Location = new Point(22, 180);
            _reconnectButton.Size = new Size(105, 32);
            Controls.Add(_reconnectButton);

            _disconnectButton = new Button();
            _disconnectButton.Text = "연결 해제";
            _disconnectButton.Location = new Point(137, 180);
            _disconnectButton.Size = new Size(95, 32);
            Controls.Add(_disconnectButton);

            Label logLabel = new Label();
            logLabel.Text = "비식별 진단 로그";
            logLabel.Location = new Point(22, 228);
            logLabel.AutoSize = true;
            Controls.Add(logLabel);

            _logBox = new TextBox();
            _logBox.Location = new Point(22, 252);
            _logBox.Size = new Size(640, 170);
            _logBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            _logBox.Multiline = true;
            _logBox.ReadOnly = true;
            _logBox.ScrollBars = ScrollBars.Vertical;
            _logBox.Font = new Font("Consolas", 8.5F);
            Controls.Add(_logBox);

            FormClosing += StatusFormClosing;
        }

        public event EventHandler ReconnectRequested
        {
            add { _reconnectButton.Click += value; }
            remove { _reconnectButton.Click -= value; }
        }

        public event EventHandler DisconnectRequested
        {
            add { _disconnectButton.Click += value; }
            remove { _disconnectButton.Click -= value; }
        }

        public void UpdateStatus(BridgeStatusEventArgs status)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<BridgeStatusEventArgs>(UpdateStatus), status);
                return;
            }

            _stateLabel.Text = StateText(status.State);
            _stateLabel.ForeColor = StateColor(status.State);
            _messageLabel.Text = status.Message;
            _disconnectButton.Enabled = status.State != BridgeConnectionState.Stopped;
        }

        public void ShowInboundRing(InboundRingEventArgs ring)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<InboundRingEventArgs>(ShowInboundRing), ring);
                return;
            }

            _lastRingLabel.Text = "최근 수신: " + ring.MaskedCaller + " · 이벤트 " + ring.UniqueId;
        }

        public void AppendLog(string line)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(AppendLog), line);
                return;
            }

            List<string> lines = new List<string>(_logBox.Lines);
            lines.Add(line);
            if (lines.Count > 200)
            {
                lines.RemoveRange(0, lines.Count - 200);
            }

            _logBox.Lines = lines.ToArray();
            _logBox.SelectionStart = _logBox.TextLength;
            _logBox.ScrollToCaret();
        }

        public void ShowFromTray()
        {
            Show();
            WindowState = FormWindowState.Normal;
            ShowInTaskbar = true;
            Activate();
        }

        public void HideToTray()
        {
            ShowInTaskbar = false;
            Hide();
        }

        private void StatusFormClosing(object sender, FormClosingEventArgs eventArgs)
        {
            if (eventArgs.CloseReason == CloseReason.UserClosing)
            {
                eventArgs.Cancel = true;
                HideToTray();
            }
        }

        private static string StateText(BridgeConnectionState state)
        {
            switch (state)
            {
                case BridgeConnectionState.Connected:
                    return "정상 · 수신 대기";
                case BridgeConnectionState.Connecting:
                    return "연결 중";
                case BridgeConnectionState.Reconnecting:
                    return "재연결 중";
                case BridgeConnectionState.ConfigurationError:
                    return "설정 확인 필요";
                case BridgeConnectionState.Stopped:
                    return "연결 해제됨";
                default:
                    return "시작 중";
            }
        }

        private static Color StateColor(BridgeConnectionState state)
        {
            if (state == BridgeConnectionState.Connected)
            {
                return Color.FromArgb(16, 120, 82);
            }

            if (state == BridgeConnectionState.ConfigurationError)
            {
                return Color.FromArgb(170, 52, 42);
            }

            return Color.FromArgb(138, 88, 16);
        }

        private static string LastFour(string value)
        {
            string digits = CentrexEventParser.DigitsOnly(value);
            return digits.Substring(Math.Max(0, digits.Length - 4));
        }
    }
}
