using System;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

namespace Lawand.DesktopNotifier
{
    internal sealed class PairingForm : Form
    {
        private readonly NotifierConfiguration configuration;
        private readonly GatewayClient gatewayClient;
        private readonly TextBox pairingCodeTextBox;
        private readonly TextBox deviceNameTextBox;
        private readonly TextBox gatewayUrlTextBox;
        private readonly TextBox erpUrlTextBox;
        private readonly Button connectButton;
        private readonly Label statusLabel;

        public PairingForm(
            NotifierConfiguration configuration,
            GatewayClient gatewayClient)
        {
            this.configuration = configuration;
            this.gatewayClient = gatewayClient;

            Text = "LAW& OS 알림 연결";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = true;
            ClientSize = new Size(560, 430);
            Font = new Font("Segoe UI", 9F);

            Label title = new Label();
            title.Text = "이 Windows PC를 ERP 계정과 연결합니다";
            title.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(28, 24);
            Controls.Add(title);

            Label description = new Label();
            description.Text =
                "ERP의 PC 알림 설정에서 발급한 5분짜리 일회용 코드를 붙여넣으세요.\r\n" +
                "ERP 비밀번호는 이 프로그램에 입력하거나 저장하지 않습니다.";
            description.AutoSize = true;
            description.ForeColor = Color.DimGray;
            description.Location = new Point(30, 62);
            Controls.Add(description);

            pairingCodeTextBox = AddField(
                "일회용 연결 코드",
                string.Empty,
                105,
                420);
            pairingCodeTextBox.Font = new Font("Consolas", 10F);

            deviceNameTextBox = AddField(
                "컴퓨터 이름",
                configuration.DeviceName,
                169,
                250);
            gatewayUrlTextBox = AddField(
                "Gateway 주소",
                configuration.GatewayBaseUrl,
                233,
                420);
            erpUrlTextBox = AddField(
                "ERP 주소",
                configuration.ErpBaseUrl,
                297,
                420);

            statusLabel = new Label();
            statusLabel.AutoSize = false;
            statusLabel.Location = new Point(30, 355);
            statusLabel.Size = new Size(340, 48);
            statusLabel.ForeColor = Color.Firebrick;
            Controls.Add(statusLabel);

            connectButton = new Button();
            connectButton.Text = "이 컴퓨터 연결";
            connectButton.Size = new Size(150, 40);
            connectButton.Location = new Point(380, 352);
            connectButton.BackColor = Color.FromArgb(23, 107, 75);
            connectButton.ForeColor = Color.White;
            connectButton.FlatStyle = FlatStyle.Flat;
            connectButton.FlatAppearance.BorderSize = 0;
            connectButton.Click += ConnectButtonClick;
            Controls.Add(connectButton);
            AcceptButton = connectButton;
        }

        private TextBox AddField(string labelText, string value, int top, int width)
        {
            Label label = new Label();
            label.Text = labelText;
            label.AutoSize = true;
            label.Location = new Point(30, top);
            Controls.Add(label);

            TextBox textBox = new TextBox();
            textBox.Text = value ?? string.Empty;
            textBox.Location = new Point(30, top + 22);
            textBox.Size = new Size(width, 28);
            Controls.Add(textBox);
            return textBox;
        }

        private async void ConnectButtonClick(object sender, EventArgs eventArgs)
        {
            connectButton.Enabled = false;
            statusLabel.ForeColor = Color.DimGray;
            statusLabel.Text = "연결을 확인하고 있습니다…";
            try
            {
                string pairingCode = pairingCodeTextBox.Text.Trim();
                if (pairingCode.Length != 43)
                {
                    throw new ArgumentException("ERP에서 발급한 연결 코드 전체를 붙여넣어 주세요.");
                }
                string deviceName = deviceNameTextBox.Text.Trim();
                if (deviceName.Length < 1 || deviceName.Length > 100)
                {
                    throw new ArgumentException("컴퓨터 이름은 1~100자로 입력해 주세요.");
                }

                configuration.GatewayBaseUrl = UrlSafety.NormalizeBaseUrl(
                    gatewayUrlTextBox.Text,
                    "Gateway 주소");
                configuration.ErpBaseUrl = UrlSafety.NormalizeBaseUrl(
                    erpUrlTextBox.Text,
                    "ERP 주소");
                using (CancellationTokenSource timeout =
                    new CancellationTokenSource(TimeSpan.FromSeconds(20)))
                {
                    PairingResult result = await gatewayClient.PairAsync(
                        configuration.GatewayBaseUrl,
                        pairingCode,
                        deviceName,
                        timeout.Token);
                    CredentialStore.Write(
                        configuration.CredentialTarget,
                        result.device.id,
                        result.deviceToken);
                    configuration.DeviceId = result.device.id;
                    configuration.DeviceName = result.device.name;
                    configuration.StaffDisplayName = result.device.staffDisplayName;
                    configuration.RecentlyDisplayedDeliveryIds.Clear();
                    configuration.Save();
                }
                statusLabel.ForeColor = Color.FromArgb(23, 107, 75);
                statusLabel.Text = "연결되었습니다.";
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (GatewayClientException exception)
            {
                statusLabel.ForeColor = Color.Firebrick;
                statusLabel.Text = exception.Message;
            }
            catch (OperationCanceledException)
            {
                statusLabel.ForeColor = Color.Firebrick;
                statusLabel.Text = "연결 시간이 초과되었습니다. 서버 주소를 확인해 주세요.";
            }
            catch (Exception exception)
            {
                statusLabel.ForeColor = Color.Firebrick;
                statusLabel.Text = exception.Message;
            }
            finally
            {
                connectButton.Enabled = true;
            }
        }
    }
}
