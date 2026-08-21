using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Lawand.DesktopNotifier.Installation;

[assembly: AssemblyTitle("LAW& OS 알림 제거")]
[assembly: AssemblyDescription("법무법인 로앤 Windows PC 업무 알림 제거 프로그램")]
[assembly: AssemblyCompany("법무법인 로앤")]
[assembly: AssemblyProduct("LAW& OS 알림")]
[assembly: AssemblyCopyright("Copyright © 법무법인 로앤 2026")]
[assembly: AssemblyVersion("0.1.0.0")]
[assembly: AssemblyFileVersion("0.1.0.0")]
[assembly: ComVisible(false)]
[assembly: Guid("aeff7f19-b3ca-49f3-8194-cd3085e07168")]

namespace Lawand.DesktopNotifier.Uninstall
{
    internal static class UninstallProgram
    {
        [STAThread]
        private static int Main(string[] args)
        {
            bool quiet = HasArgument(args, "--quiet");
            if (HasArgument(args, "--verify"))
            {
                return 0;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (!quiet)
            {
                DialogResult result = MessageBox.Show(
                    "LAW& OS 알림을 이 컴퓨터에서 제거할까요?\r\n\r\n" +
                    "이 PC의 연결 정보와 개인 알림 설정도 함께 삭제됩니다.",
                    "LAW& OS 알림 제거",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button2);
                if (result != DialogResult.Yes)
                {
                    return 2;
                }
            }

            try
            {
                InstallerOperations.StopRunningApplication();
                DeleteStoredCredential();
                InstallerOperations.RemoveRegistrationAndShortcuts();
                DeleteSettingsDirectory();

                if (!quiet)
                {
                    MessageBox.Show(
                        "LAW& OS 알림을 제거했습니다.\r\n\r\n" +
                        "ERP의 연결 기기 목록에는 이 컴퓨터가 잠시 남을 수 있으며, " +
                        "필요하면 PC 알림 설정에서 연결 해제할 수 있습니다.",
                        "제거 완료",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }
                ScheduleInstallDirectoryRemoval();
                return 0;
            }
            catch (Exception exception)
            {
                if (!quiet)
                {
                    MessageBox.Show(
                        "LAW& OS 알림을 완전히 제거하지 못했습니다.\r\n\r\n" +
                        exception.Message,
                        "제거 오류",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
                return 1;
            }
        }

        private static bool HasArgument(string[] args, string expected)
        {
            if (args == null)
            {
                return false;
            }
            foreach (string value in args)
            {
                if (string.Equals(value, expected, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private static void DeleteStoredCredential()
        {
            foreach (string target in ReadCredentialTargets())
            {
                try
                {
                    Lawand.DesktopNotifier.CredentialStore.Delete(target);
                }
                catch
                {
                    // 설정·프로그램 제거는 자격 증명 관리자 정리 실패와 독립적으로 계속한다.
                }
            }
        }

        private static IEnumerable<string> ReadCredentialTargets()
        {
            HashSet<string> targets = new HashSet<string>(
                StringComparer.OrdinalIgnoreCase);
            AddCredentialTarget(targets, "https://api.lawandfirm.com");

            try
            {
                if (File.Exists(InstallerContract.SettingsPath))
                {
                    JavaScriptSerializer serializer = new JavaScriptSerializer();
                    Dictionary<string, object> settings =
                        serializer.Deserialize<Dictionary<string, object>>(
                            File.ReadAllText(InstallerContract.SettingsPath));
                    object gatewayValue;
                    if (settings != null &&
                        settings.TryGetValue("GatewayBaseUrl", out gatewayValue))
                    {
                        AddCredentialTarget(
                            targets,
                            Convert.ToString(gatewayValue));
                    }
                }
            }
            catch
            {
                // 손상된 설정 파일은 삭제하되 기본 운영 자격 증명은 계속 정리한다.
            }
            return targets;
        }

        private static void AddCredentialTarget(
            ISet<string> targets,
            string gatewayBaseUrl)
        {
            Uri gateway;
            if (string.IsNullOrWhiteSpace(gatewayBaseUrl) ||
                !Uri.TryCreate(gatewayBaseUrl, UriKind.Absolute, out gateway))
            {
                return;
            }
            string authority = gateway.Authority
                .ToLowerInvariant()
                .Replace(':', '_')
                .Replace('[', '_')
                .Replace(']', '_');
            targets.Add("Lawand/DesktopNotifier/v1/" + authority);
        }

        private static void DeleteSettingsDirectory()
        {
            try
            {
                if (Directory.Exists(InstallerContract.SettingsDirectory))
                {
                    Directory.Delete(InstallerContract.SettingsDirectory, true);
                }
            }
            catch (IOException)
            {
                // 지연 제거 명령이 설치 파일과 함께 남은 설정 파일도 다시 정리한다.
            }
            catch (UnauthorizedAccessException)
            {
                // 사용자 프로필 권한 변경 시 프로그램 제거 자체는 계속한다.
            }
        }

        private static void ScheduleInstallDirectoryRemoval()
        {
            string command = "ping 127.0.0.1 -n 3 > nul & rmdir /s /q " +
                InstallerOperations.Quote(InstallerContract.InstallDirectory) +
                " & rmdir /s /q " +
                InstallerOperations.Quote(InstallerContract.SettingsDirectory);
            ProcessStartInfo startInfo = new ProcessStartInfo("cmd.exe");
            startInfo.Arguments = "/d /c " + command;
            startInfo.CreateNoWindow = true;
            startInfo.UseShellExecute = false;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(startInfo);
        }
    }
}
