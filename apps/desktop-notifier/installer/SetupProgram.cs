using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Lawand.DesktopNotifier.Installation;

[assembly: AssemblyTitle("LAW& OS 알림 설치")]
[assembly: AssemblyDescription("법무법인 로앤 Windows PC 업무 알림 설치 프로그램")]
[assembly: AssemblyCompany("법무법인 로앤")]
[assembly: AssemblyProduct("LAW& OS 알림 설치")]
[assembly: AssemblyCopyright("Copyright © 법무법인 로앤 2026")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]
[assembly: ComVisible(false)]
[assembly: Guid("5f092f77-fc17-44b4-b28a-59e47ca74ca2")]

namespace Lawand.DesktopNotifier.Setup
{
    internal static class SetupProgram
    {
        private const string ApplicationResourceName =
            "Lawand.DesktopNotifier.Payload.exe";
        private const string UninstallerResourceName =
            "Lawand.DesktopNotifier.UninstallPayload.exe";
        private const string DefaultsResourceName =
            "Lawand.DesktopNotifier.Defaults.json";

        [STAThread]
        private static int Main(string[] args)
        {
            if (args != null && args.Length == 1 &&
                string.Equals(args[0], "--verify", StringComparison.Ordinal))
            {
                return VerifyEmbeddedPackage();
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using (SetupForm form = new SetupForm())
            {
                Application.Run(form);
                if (form.InstallSucceeded && form.LaunchAfterInstall)
                {
                    try
                    {
                        InstallerOperations.StartInstalledApplication();
                    }
                    catch (Exception exception)
                    {
                        MessageBox.Show(
                            "설치는 완료했지만 프로그램을 바로 실행하지 못했습니다.\r\n" +
                            "바탕화면의 LAW& OS 알림을 더블클릭해 주세요.\r\n\r\n" +
                            exception.Message,
                            InstallerContract.ProductName,
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning);
                    }
                }
                return form.InstallSucceeded ? 0 : form.InstallAttempted ? 1 : 2;
            }
        }

        internal static void InstallPayload()
        {
            Directory.CreateDirectory(InstallerContract.InstallDirectory);
            WriteEmbeddedResource(
                ApplicationResourceName,
                InstallerContract.ApplicationPath);
            WriteEmbeddedResource(
                UninstallerResourceName,
                InstallerContract.UninstallerPath);
            WriteEmbeddedResource(
                DefaultsResourceName,
                InstallerContract.DefaultsPath);

            InstallerOperations.DeleteFile(Path.Combine(
                InstallerContract.InstallDirectory,
                "install.ps1"));
            InstallerOperations.DeleteFile(Path.Combine(
                InstallerContract.InstallDirectory,
                "uninstall.ps1"));
        }

        private static void WriteEmbeddedResource(
            string resourceName,
            string destinationPath)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();
            using (Stream source = assembly.GetManifestResourceStream(resourceName))
            {
                if (source == null)
                {
                    throw new InvalidDataException(
                        "설치 파일 안의 구성요소를 찾지 못했습니다: " + resourceName);
                }

                string temporaryPath = destinationPath + ".new-" +
                    Guid.NewGuid().ToString("N");
                try
                {
                    using (FileStream destination = new FileStream(
                        temporaryPath,
                        FileMode.CreateNew,
                        FileAccess.Write,
                        FileShare.None))
                    {
                        source.CopyTo(destination);
                        destination.Flush(true);
                    }
                    if (File.Exists(destinationPath))
                    {
                        try
                        {
                            File.Replace(temporaryPath, destinationPath, null, true);
                        }
                        catch (PlatformNotSupportedException)
                        {
                            File.Copy(temporaryPath, destinationPath, true);
                            File.Delete(temporaryPath);
                        }
                    }
                    else
                    {
                        File.Move(temporaryPath, destinationPath);
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
        }

        private static int VerifyEmbeddedPackage()
        {
            string temporaryDirectory = Path.Combine(
                Path.GetTempPath(),
                "lawand-desktop-notifier-setup-verify-" + Guid.NewGuid().ToString("N"));
            try
            {
                Directory.CreateDirectory(temporaryDirectory);
                string appPath = Path.Combine(
                    temporaryDirectory,
                    InstallerContract.ApplicationExecutableName);
                string uninstallerPath = Path.Combine(
                    temporaryDirectory,
                    InstallerContract.UninstallerExecutableName);
                string defaultsPath = Path.Combine(
                    temporaryDirectory,
                    InstallerContract.DefaultsFileName);
                WriteEmbeddedResourceForVerification(
                    ApplicationResourceName,
                    appPath);
                WriteEmbeddedResourceForVerification(
                    UninstallerResourceName,
                    uninstallerPath);
                WriteEmbeddedResourceForVerification(
                    DefaultsResourceName,
                    defaultsPath);

                FileVersionInfo appVersion = FileVersionInfo.GetVersionInfo(appPath);
                FileVersionInfo uninstallerVersion =
                    FileVersionInfo.GetVersionInfo(uninstallerPath);
                string defaults = File.ReadAllText(defaultsPath);
                bool signedInstaller = SignedFileInspection.HasAuthenticodeSignature(
                    Application.ExecutablePath);
                if (!string.Equals(
                        appVersion.FileVersion,
                        "0.1.0.0",
                        StringComparison.Ordinal) ||
                    !string.Equals(
                        uninstallerVersion.FileVersion,
                        "0.1.0.0",
                        StringComparison.Ordinal) ||
                    defaults.IndexOf("GatewayBaseUrl", StringComparison.Ordinal) < 0 ||
                    defaults.IndexOf("ErpBaseUrl", StringComparison.Ordinal) < 0 ||
                    (signedInstaller &&
                        (!SignedFileInspection.HasAuthenticodeSignature(appPath) ||
                         !SignedFileInspection.HasAuthenticodeSignature(uninstallerPath))))
                {
                    return 1;
                }
                return 0;
            }
            catch
            {
                return 1;
            }
            finally
            {
                try
                {
                    if (Directory.Exists(temporaryDirectory))
                    {
                        Directory.Delete(temporaryDirectory, true);
                    }
                }
                catch
                {
                    // 검증용 임시 폴더는 다음 Windows 임시 정리에서 제거된다.
                }
            }
        }

        private static void WriteEmbeddedResourceForVerification(
            string resourceName,
            string destinationPath)
        {
            using (Stream source = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream(resourceName))
            {
                if (source == null)
                {
                    throw new InvalidDataException(resourceName);
                }
                using (FileStream destination = File.Create(destinationPath))
                {
                    source.CopyTo(destination);
                }
            }
        }
    }

    internal sealed class SetupForm : Form
    {
        private readonly CheckBox desktopShortcutCheckBox;
        private readonly CheckBox automaticStartCheckBox;
        private readonly CheckBox launchCheckBox;
        private readonly Button installButton;
        private readonly Button cancelButton;
        private readonly Label progressLabel;
        private readonly ProgressBar progressBar;

        public SetupForm()
        {
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(247, 250, 252);
            ClientSize = new Size(590, 500);
            Font = new Font("Segoe UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = true;
            StartPosition = FormStartPosition.CenterScreen;
            Text = "LAW& OS 알림 설치";
            TryApplyApplicationIcon();

            Panel header = new Panel();
            header.BackColor = Color.FromArgb(8, 112, 108);
            header.Dock = DockStyle.Top;
            header.Height = 116;
            Controls.Add(header);

            Label mark = new Label();
            mark.BackColor = Color.FromArgb(255, 255, 255);
            mark.ForeColor = Color.FromArgb(8, 112, 108);
            mark.Font = new Font("Segoe UI", 18F, FontStyle.Bold, GraphicsUnit.Point);
            mark.Location = new Point(24, 27);
            mark.Size = new Size(58, 58);
            mark.Text = "L&";
            mark.TextAlign = ContentAlignment.MiddleCenter;
            mark.UseMnemonic = false;
            header.Controls.Add(mark);

            Label heading = new Label();
            heading.AutoSize = false;
            heading.ForeColor = Color.White;
            heading.Font = new Font("Segoe UI", 19F, FontStyle.Bold, GraphicsUnit.Point);
            heading.Location = new Point(102, 24);
            heading.Size = new Size(450, 42);
            heading.Text = "LAW& OS 알림 설치";
            heading.TextAlign = ContentAlignment.MiddleLeft;
            heading.UseMnemonic = false;
            header.Controls.Add(heading);

            Label subheading = new Label();
            subheading.AutoSize = false;
            subheading.ForeColor = Color.FromArgb(215, 248, 245);
            subheading.Location = new Point(104, 65);
            subheading.Size = new Size(440, 27);
            subheading.Text = "업무 알림을 Windows 화면 우측 상단에서 바로 확인합니다.";
            subheading.TextAlign = ContentAlignment.MiddleLeft;
            header.Controls.Add(subheading);

            bool signed = SignedFileInspection.HasAuthenticodeSignature(
                Application.ExecutablePath);
            Panel signaturePanel = new Panel();
            signaturePanel.BackColor = signed
                ? Color.FromArgb(229, 249, 240)
                : Color.FromArgb(255, 246, 220);
            signaturePanel.Location = new Point(24, 137);
            signaturePanel.Size = new Size(542, 54);
            Controls.Add(signaturePanel);

            Label signatureLabel = new Label();
            signatureLabel.AutoSize = false;
            signatureLabel.ForeColor = signed
                ? Color.FromArgb(3, 112, 76)
                : Color.FromArgb(146, 94, 8);
            signatureLabel.Font = new Font(
                "Segoe UI",
                9.5F,
                FontStyle.Bold,
                GraphicsUnit.Point);
            signatureLabel.Location = new Point(14, 8);
            signatureLabel.Size = new Size(514, 38);
            signatureLabel.Text = signed
                ? "✓ 디지털 서명이 포함된 배포본입니다."
                : "! 개발용 무서명 설치본입니다. 법무법인 로앤 내부 테스트 PC에서만 설치하세요.";
            signatureLabel.TextAlign = ContentAlignment.MiddleLeft;
            signaturePanel.Controls.Add(signatureLabel);

            Label bodyTitle = new Label();
            bodyTitle.AutoSize = false;
            bodyTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold, GraphicsUnit.Point);
            bodyTitle.ForeColor = Color.FromArgb(15, 23, 42);
            bodyTitle.Location = new Point(28, 207);
            bodyTitle.Size = new Size(520, 30);
            bodyTitle.Text = "이 컴퓨터에 설치할 항목";
            Controls.Add(bodyTitle);

            desktopShortcutCheckBox = CreateOption(
                "바탕화면에 LAW& OS 알림 바로가기 만들기",
                246);
            automaticStartCheckBox = CreateOption(
                "Windows 로그인 시 자동으로 실행하기",
                283);
            launchCheckBox = CreateOption(
                "설치가 끝나면 LAW& OS 알림 바로 실행하기",
                320);

            Label installPathLabel = new Label();
            installPathLabel.AutoEllipsis = true;
            installPathLabel.ForeColor = Color.FromArgb(100, 116, 139);
            installPathLabel.Location = new Point(31, 363);
            installPathLabel.Size = new Size(530, 24);
            installPathLabel.Text = "설치 위치  " + InstallerContract.InstallDirectory;
            Controls.Add(installPathLabel);

            progressLabel = new Label();
            progressLabel.ForeColor = Color.FromArgb(8, 112, 108);
            progressLabel.Location = new Point(31, 394);
            progressLabel.Size = new Size(390, 22);
            progressLabel.Text = "설치 준비가 완료되었습니다.";
            Controls.Add(progressLabel);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(31, 420);
            progressBar.MarqueeAnimationSpeed = 24;
            progressBar.Size = new Size(350, 8);
            progressBar.Style = ProgressBarStyle.Marquee;
            progressBar.Visible = false;
            Controls.Add(progressBar);

            cancelButton = new Button();
            cancelButton.DialogResult = DialogResult.Cancel;
            cancelButton.FlatStyle = FlatStyle.Flat;
            cancelButton.Location = new Point(390, 405);
            cancelButton.Size = new Size(82, 42);
            cancelButton.Text = "취소";
            cancelButton.UseVisualStyleBackColor = true;
            Controls.Add(cancelButton);

            installButton = new Button();
            installButton.BackColor = Color.FromArgb(10, 151, 145);
            installButton.FlatAppearance.BorderSize = 0;
            installButton.FlatStyle = FlatStyle.Flat;
            installButton.Font = new Font("Segoe UI", 10F, FontStyle.Bold, GraphicsUnit.Point);
            installButton.ForeColor = Color.White;
            installButton.Location = new Point(480, 405);
            installButton.Size = new Size(86, 42);
            installButton.Text = "설치";
            installButton.UseVisualStyleBackColor = false;
            installButton.Click += InstallButtonClick;
            Controls.Add(installButton);

            AcceptButton = installButton;
            CancelButton = cancelButton;
        }

        public bool InstallAttempted { get; private set; }
        public bool InstallSucceeded { get; private set; }
        public bool LaunchAfterInstall { get; private set; }

        private CheckBox CreateOption(string text, int top)
        {
            CheckBox option = new CheckBox();
            option.AutoSize = false;
            option.Checked = true;
            option.ForeColor = Color.FromArgb(30, 41, 59);
            option.Location = new Point(31, top);
            option.Size = new Size(520, 28);
            option.Text = text;
            option.UseMnemonic = false;
            option.UseVisualStyleBackColor = true;
            Controls.Add(option);
            return option;
        }

        private void InstallButtonClick(object sender, EventArgs eventArgs)
        {
            InstallAttempted = true;
            if (InstallerOperations.IsApplicationRunning())
            {
                DialogResult closeResult = MessageBox.Show(
                    "업데이트를 위해 실행 중인 LAW& OS 알림을 종료하고 설치할까요?\r\n" +
                    "기존 PC 연결과 개인 설정은 그대로 유지됩니다.",
                    "LAW& OS 알림 설치",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question);
                if (closeResult != DialogResult.Yes)
                {
                    InstallAttempted = false;
                    return;
                }
            }

            SetBusy(true, "프로그램을 설치하고 있습니다…");
            try
            {
                InstallerOperations.StopRunningApplication();
                SetupProgram.InstallPayload();
                InstallerOperations.CreateShortcut(
                    InstallerContract.StartMenuShortcutPath,
                    InstallerContract.ApplicationPath,
                    "LAW& OS Windows PC 업무 알림");
                if (desktopShortcutCheckBox.Checked)
                {
                    InstallerOperations.CreateShortcut(
                        InstallerContract.DesktopShortcutPath,
                        InstallerContract.ApplicationPath,
                        "LAW& OS Windows PC 업무 알림");
                }
                else
                {
                    InstallerOperations.DeleteFile(
                        InstallerContract.DesktopShortcutPath);
                }
                InstallerOperations.ConfigureAutomaticStart(
                    automaticStartCheckBox.Checked);
                InstallerOperations.RegisterUninstaller();

                LaunchAfterInstall = launchCheckBox.Checked;
                InstallSucceeded = true;
                progressLabel.Text = "설치가 완료되었습니다.";
                MessageBox.Show(
                    "LAW& OS 알림 설치가 완료되었습니다.\r\n" +
                    (LaunchAfterInstall
                        ? "잠시 후 알림 프로그램이 실행됩니다."
                        : "시작 메뉴의 LAW& OS 알림에서 언제든 실행할 수 있습니다."),
                    "설치 완료",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                Close();
            }
            catch (Exception exception)
            {
                InstallSucceeded = false;
                SetBusy(false, "설치를 완료하지 못했습니다.");
                MessageBox.Show(
                    "LAW& OS 알림을 설치하지 못했습니다.\r\n\r\n" + exception.Message,
                    "설치 오류",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private void SetBusy(bool busy, string message)
        {
            UseWaitCursor = busy;
            desktopShortcutCheckBox.Enabled = !busy;
            automaticStartCheckBox.Enabled = !busy;
            launchCheckBox.Enabled = !busy;
            installButton.Enabled = !busy;
            cancelButton.Enabled = !busy;
            progressBar.Visible = busy;
            progressLabel.Text = message;
            Refresh();
        }

        private void TryApplyApplicationIcon()
        {
            try
            {
                Icon extracted = Icon.ExtractAssociatedIcon(
                    Application.ExecutablePath);
                if (extracted != null)
                {
                    Icon = extracted;
                }
            }
            catch
            {
                // 아이콘 추출 실패가 설치를 막지 않는다.
            }
        }
    }
}
