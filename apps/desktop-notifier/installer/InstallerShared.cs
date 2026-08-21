using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace Lawand.DesktopNotifier.Installation
{
    internal static class InstallerContract
    {
        public const string ProductName = "LAW& OS 알림";
        public const string ProductVersion = "0.1.0";
        public const string Publisher = "법무법인 로앤";
        public const string ApplicationExecutableName =
            "Lawand.DesktopNotifier.exe";
        public const string UninstallerExecutableName =
            "Lawand.DesktopNotifier.Uninstall.exe";
        public const string DefaultsFileName = "notifier.defaults.json";
        public const string RunValueName = "LawandDesktopNotifier";
        public const string ProcessName = "Lawand.DesktopNotifier";
        public const string UninstallRegistryPath =
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\LawandDesktopNotifier";

        public static string InstallDirectory
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(
                        Environment.SpecialFolder.LocalApplicationData),
                    "Programs",
                    "Lawand",
                    "DesktopNotifier");
            }
        }

        public static string ApplicationPath
        {
            get
            {
                return Path.Combine(
                    InstallDirectory,
                    ApplicationExecutableName);
            }
        }

        public static string UninstallerPath
        {
            get
            {
                return Path.Combine(
                    InstallDirectory,
                    UninstallerExecutableName);
            }
        }

        public static string DefaultsPath
        {
            get
            {
                return Path.Combine(InstallDirectory, DefaultsFileName);
            }
        }

        public static string SettingsDirectory
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(
                        Environment.SpecialFolder.LocalApplicationData),
                    "Lawand",
                    "DesktopNotifier");
            }
        }

        public static string SettingsPath
        {
            get { return Path.Combine(SettingsDirectory, "settings.json"); }
        }

        public static string DesktopShortcutPath
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(
                        Environment.SpecialFolder.DesktopDirectory),
                    ProductName + ".lnk");
            }
        }

        public static string StartMenuDirectory
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(
                        Environment.SpecialFolder.Programs),
                    "LAW& OS");
            }
        }

        public static string StartMenuShortcutPath
        {
            get
            {
                return Path.Combine(
                    StartMenuDirectory,
                    ProductName + ".lnk");
            }
        }
    }

    internal static class InstallerOperations
    {
        public static bool IsApplicationRunning()
        {
            Process[] processes = Process.GetProcessesByName(
                InstallerContract.ProcessName);
            try
            {
                return processes.Length > 0;
            }
            finally
            {
                foreach (Process process in processes)
                {
                    process.Dispose();
                }
            }
        }

        public static void StopRunningApplication()
        {
            Process[] processes = Process.GetProcessesByName(
                InstallerContract.ProcessName);
            foreach (Process process in processes)
            {
                using (process)
                {
                    try
                    {
                        process.Kill();
                        process.WaitForExit(5000);
                    }
                    catch (InvalidOperationException)
                    {
                        // 사용자가 먼저 종료한 경우에는 계속 설치한다.
                    }
                }
            }
        }

        public static void CreateShortcut(
            string shortcutPath,
            string targetPath,
            string description)
        {
            string directory = Path.GetDirectoryName(shortcutPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null)
            {
                throw new InvalidOperationException(
                    "Windows 바로가기 기능을 사용할 수 없습니다.");
            }

            object shell = null;
            object shortcut = null;
            try
            {
                shell = Activator.CreateInstance(shellType);
                shortcut = shellType.InvokeMember(
                    "CreateShortcut",
                    BindingFlags.InvokeMethod,
                    null,
                    shell,
                    new object[] { shortcutPath });
                Type shortcutType = shortcut.GetType();
                shortcutType.InvokeMember(
                    "TargetPath",
                    BindingFlags.SetProperty,
                    null,
                    shortcut,
                    new object[] { targetPath });
                shortcutType.InvokeMember(
                    "WorkingDirectory",
                    BindingFlags.SetProperty,
                    null,
                    shortcut,
                    new object[] { Path.GetDirectoryName(targetPath) });
                shortcutType.InvokeMember(
                    "Description",
                    BindingFlags.SetProperty,
                    null,
                    shortcut,
                    new object[] { description });
                shortcutType.InvokeMember(
                    "IconLocation",
                    BindingFlags.SetProperty,
                    null,
                    shortcut,
                    new object[] { targetPath + ",0" });
                shortcutType.InvokeMember(
                    "Save",
                    BindingFlags.InvokeMethod,
                    null,
                    shortcut,
                    null);
            }
            finally
            {
                ReleaseComObject(shortcut);
                ReleaseComObject(shell);
            }
        }

        public static void ConfigureAutomaticStart(bool enabled)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Run"))
            {
                if (enabled)
                {
                    key.SetValue(
                        InstallerContract.RunValueName,
                        Quote(InstallerContract.ApplicationPath),
                        RegistryValueKind.String);
                }
                else
                {
                    key.DeleteValue(
                        InstallerContract.RunValueName,
                        false);
                }
            }
        }

        public static void RegisterUninstaller()
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(
                InstallerContract.UninstallRegistryPath))
            {
                key.SetValue(
                    "DisplayName",
                    InstallerContract.ProductName,
                    RegistryValueKind.String);
                key.SetValue(
                    "DisplayVersion",
                    InstallerContract.ProductVersion,
                    RegistryValueKind.String);
                key.SetValue(
                    "Publisher",
                    InstallerContract.Publisher,
                    RegistryValueKind.String);
                key.SetValue(
                    "DisplayIcon",
                    InstallerContract.ApplicationPath + ",0",
                    RegistryValueKind.String);
                key.SetValue(
                    "InstallLocation",
                    InstallerContract.InstallDirectory,
                    RegistryValueKind.String);
                key.SetValue(
                    "UninstallString",
                    Quote(InstallerContract.UninstallerPath),
                    RegistryValueKind.String);
                key.SetValue(
                    "QuietUninstallString",
                    Quote(InstallerContract.UninstallerPath) + " --quiet",
                    RegistryValueKind.String);
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                key.SetValue(
                    "EstimatedSize",
                    EstimatedInstalledSizeKilobytes(),
                    RegistryValueKind.DWord);
                key.SetValue(
                    "InstallDate",
                    DateTime.Now.ToString("yyyyMMdd"),
                    RegistryValueKind.String);
            }
        }

        public static void RemoveRegistrationAndShortcuts()
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Run",
                true))
            {
                if (key != null)
                {
                    key.DeleteValue(
                        InstallerContract.RunValueName,
                        false);
                }
            }
            Registry.CurrentUser.DeleteSubKeyTree(
                InstallerContract.UninstallRegistryPath,
                false);
            DeleteFile(InstallerContract.DesktopShortcutPath);
            DeleteFile(InstallerContract.StartMenuShortcutPath);
            TryDeleteEmptyDirectory(InstallerContract.StartMenuDirectory);
        }

        public static void StartInstalledApplication()
        {
            ProcessStartInfo startInfo = new ProcessStartInfo(
                InstallerContract.ApplicationPath);
            startInfo.UseShellExecute = true;
            Process.Start(startInfo);
        }

        public static void DeleteFile(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch (IOException)
            {
                // 제거 프로그램의 지연 정리가 남은 파일을 처리한다.
            }
            catch (UnauthorizedAccessException)
            {
                // 사용자에게 최종 제거 안내에서 수동 경로를 알려준다.
            }
        }

        public static void TryDeleteEmptyDirectory(string path)
        {
            try
            {
                if (Directory.Exists(path) &&
                    Directory.GetFileSystemEntries(path).Length == 0)
                {
                    Directory.Delete(path);
                }
            }
            catch (IOException)
            {
                // 다른 LAW& OS 바로가기가 있으면 폴더를 유지한다.
            }
            catch (UnauthorizedAccessException)
            {
                // 바로가기 삭제 실패는 본 프로그램 제거를 막지 않는다.
            }
        }

        public static string Quote(string value)
        {
            return "\"" + (value ?? string.Empty).Replace("\"", "\\\"") + "\"";
        }

        private static int EstimatedInstalledSizeKilobytes()
        {
            long bytes = 0;
            foreach (string path in new string[]
            {
                InstallerContract.ApplicationPath,
                InstallerContract.UninstallerPath,
                InstallerContract.DefaultsPath
            })
            {
                if (File.Exists(path))
                {
                    bytes += new FileInfo(path).Length;
                }
            }
            return checked((int)Math.Max(1, (bytes + 1023) / 1024));
        }

        private static void ReleaseComObject(object value)
        {
            if (value != null && Marshal.IsComObject(value))
            {
                Marshal.FinalReleaseComObject(value);
            }
        }
    }

    internal static class SignedFileInspection
    {
        public static bool HasAuthenticodeSignature(string path)
        {
            try
            {
                using (System.Security.Cryptography.X509Certificates.X509Certificate2 certificate =
                    new System.Security.Cryptography.X509Certificates.X509Certificate2(
                        System.Security.Cryptography.X509Certificates.X509Certificate
                            .CreateFromSignedFile(path)))
                {
                    return !string.IsNullOrWhiteSpace(certificate.Subject);
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
