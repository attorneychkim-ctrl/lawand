using System;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace Lawand.DesktopNotifier
{
    internal static class Program
    {
        [STAThread]
        private static int Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            bool createdNew;
            using (Mutex mutex = new Mutex(
                true,
                "Local\\Lawand.DesktopNotifier.v1",
                out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show(
                        "LAW& OS 알림이 이미 실행 중입니다. 작업 표시줄 알림 영역을 확인해 주세요.",
                        "LAW& OS 알림",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    return 2;
                }

                try
                {
                    using (TrayApplicationContext context = new TrayApplicationContext())
                    {
                        Application.Run(context);
                    }
                    return 0;
                }
                catch (Exception exception)
                {
                    MessageBox.Show(
                        "LAW& OS 알림을 시작하지 못했습니다.\r\n" + exception.Message,
                        "LAW& OS 알림",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    return 1;
                }
            }
        }
    }
}
