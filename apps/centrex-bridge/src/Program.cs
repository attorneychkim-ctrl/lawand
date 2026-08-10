using System;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace Lawand.CentrexBridge
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            string configPath;
            bool provisionCredential;
            bool provisionGatewayCredential;
            string provisionGatewayAwsSecretId;
            try
            {
                ParseArguments(
                    args,
                    out configPath,
                    out provisionCredential,
                    out provisionGatewayCredential,
                    out provisionGatewayAwsSecretId);
                BridgeConfiguration configuration = BridgeConfiguration.Load(configPath);

                if (provisionCredential)
                {
                    using (CredentialProvisionForm form = new CredentialProvisionForm(configuration.CredentialTarget))
                    {
                        return form.ShowDialog() == DialogResult.OK ? 0 : 2;
                    }
                }

                if (provisionGatewayCredential)
                {
                    using (CredentialProvisionForm form = new CredentialProvisionForm(
                        configuration.GatewayCredentialTarget,
                        "Gateway 서명키 보관",
                        "Bridge ID",
                        "Gateway secret"))
                    {
                        return form.ShowDialog() == DialogResult.OK ? 0 : 2;
                    }
                }

                if (!string.IsNullOrWhiteSpace(provisionGatewayAwsSecretId))
                {
                    AwsGatewayCredentialProvisioner.Provision(
                        configuration,
                        provisionGatewayAwsSecretId);
                    return 0;
                }

                using (Mutex singleInstance = new Mutex(false, configuration.MutexName))
                {
                    bool ownsMutex;
                    try
                    {
                        ownsMutex = singleInstance.WaitOne(0, false);
                    }
                    catch (AbandonedMutexException)
                    {
                        ownsMutex = true;
                    }

                    if (!ownsMutex)
                    {
                        MessageBox.Show(
                            "이 회선의 센트릭스 브리지가 이미 실행 중입니다.",
                            "Lawand Centrex Bridge",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Information);
                        return 3;
                    }

                    try
                    {
                        Application.Run(new BridgeApplicationContext(configuration));
                    }
                    finally
                    {
                        singleInstance.ReleaseMutex();
                    }
                }
            }
            catch (Exception exception)
            {
                MessageBox.Show(
                    "센트릭스 브리지를 시작하지 못했습니다.\r\n" + exception.Message,
                    "Lawand Centrex Bridge",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }

            return 0;
        }

        private static void ParseArguments(
            string[] args,
            out string configPath,
            out bool provisionCredential,
            out bool provisionGatewayCredential,
            out string provisionGatewayAwsSecretId)
        {
            configPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Lawand",
                "CentrexBridge",
                "bridge.json");
            provisionCredential = false;
            provisionGatewayCredential = false;
            provisionGatewayAwsSecretId = null;

            for (int index = 0; index < args.Length; index++)
            {
                string argument = args[index];
                if (string.Equals(argument, "--config", StringComparison.OrdinalIgnoreCase))
                {
                    if (index + 1 >= args.Length)
                    {
                        throw new ArgumentException("--config 뒤에 설정 파일 경로가 필요합니다.");
                    }

                    configPath = Path.GetFullPath(args[++index]);
                    continue;
                }

                if (string.Equals(argument, "--provision-credential", StringComparison.OrdinalIgnoreCase))
                {
                    provisionCredential = true;
                    continue;
                }

                if (string.Equals(
                    argument,
                    "--provision-gateway-credential",
                    StringComparison.OrdinalIgnoreCase))
                {
                    provisionGatewayCredential = true;
                    continue;
                }

                if (string.Equals(
                    argument,
                    "--provision-gateway-from-aws-secret",
                    StringComparison.OrdinalIgnoreCase))
                {
                    if (index + 1 >= args.Length)
                    {
                        throw new ArgumentException(
                            "--provision-gateway-from-aws-secret 뒤에 secret ID가 필요합니다.");
                    }
                    provisionGatewayAwsSecretId = args[++index];
                    continue;
                }

                throw new ArgumentException("지원하지 않는 실행 인수입니다: " + argument);
            }


            int provisionModeCount = (provisionCredential ? 1 : 0) +
                (provisionGatewayCredential ? 1 : 0) +
                (!string.IsNullOrWhiteSpace(provisionGatewayAwsSecretId) ? 1 : 0);
            if (provisionModeCount > 1)
            {
                throw new ArgumentException("자격 증명 입력 모드는 한 번에 하나만 사용할 수 있습니다.");
            }
        }
    }
}
