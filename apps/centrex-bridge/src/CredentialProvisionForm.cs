using System;
using System.Drawing;
using System.Windows.Forms;

namespace Lawand.CentrexBridge
{
    internal sealed class CredentialProvisionForm : Form
    {
        private readonly string _target;
        private readonly TextBox _loginId;
        private readonly TextBox _password;

        public CredentialProvisionForm(string target)
            : this(
                target,
                "센트릭스 로그인 보관",
                "센트릭스 ID",
                "센트릭스 비밀번호")
        {
        }

        public CredentialProvisionForm(
            string target,
            string title,
            string loginLabel,
            string passwordLabelText)
        {
            _target = target;
            Text = title;
            ClientSize = new Size(430, 225);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Malgun Gothic", 9F);
            TopMost = true;

            Label description = new Label();
            description.Text = "입력값은 Windows 자격 증명 관리자에만 저장되며\r\n설정 파일이나 로그에는 기록되지 않습니다.";
            description.Location = new Point(20, 18);
            description.Size = new Size(390, 42);
            Controls.Add(description);

            Label idLabel = new Label();
            idLabel.Text = loginLabel;
            idLabel.Location = new Point(20, 72);
            idLabel.AutoSize = true;
            Controls.Add(idLabel);

            _loginId = new TextBox();
            _loginId.Location = new Point(140, 69);
            _loginId.Size = new Size(260, 24);
            Controls.Add(_loginId);

            Label passwordLabel = new Label();
            passwordLabel.Text = passwordLabelText;
            passwordLabel.Location = new Point(20, 112);
            passwordLabel.AutoSize = true;
            Controls.Add(passwordLabel);

            _password = new TextBox();
            _password.Location = new Point(140, 109);
            _password.Size = new Size(260, 24);
            _password.UseSystemPasswordChar = true;
            Controls.Add(_password);

            Button saveButton = new Button();
            saveButton.Text = "안전하게 저장";
            saveButton.Location = new Point(205, 165);
            saveButton.Size = new Size(95, 32);
            saveButton.Click += SaveButtonClick;
            Controls.Add(saveButton);
            AcceptButton = saveButton;

            Button cancelButton = new Button();
            cancelButton.Text = "취소";
            cancelButton.Location = new Point(310, 165);
            cancelButton.Size = new Size(90, 32);
            cancelButton.DialogResult = DialogResult.Cancel;
            Controls.Add(cancelButton);
            CancelButton = cancelButton;

            Shown += CredentialProvisionFormShown;
        }

        private void CredentialProvisionFormShown(object sender, EventArgs eventArgs)
        {
            Activate();
            BringToFront();
            _loginId.Focus();
        }

        private void SaveButtonClick(object sender, EventArgs eventArgs)
        {
            try
            {
                CredentialStore.Write(_target, _loginId.Text.Trim(), _password.Text);
                _password.Clear();
                MessageBox.Show(
                    "Windows 자격 증명 관리자에 저장했습니다.",
                    "Lawand Centrex Bridge",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (Exception exception)
            {
                _password.Clear();
                MessageBox.Show(
                    exception.Message,
                    "저장 실패",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
    }
}
