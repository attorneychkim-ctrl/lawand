namespace Lawand.CentrexBridge
{
    internal static class ProvisioningFailurePolicy
    {
        public static bool ShouldDeferNetworkError(bool provisioningActive)
        {
            // DisconnectServer() emits NETWORK_ERROR asynchronously on some
            // Centrex OCX versions. During a controlled line switch that event
            // can arrive after LoginServer() for the new line has already been
            // requested. The target LOGINRESULT (or the existing provisioning
            // timeout) is authoritative; NETWORK_ERROR alone is not.
            return provisioningActive;
        }

        public static bool ShouldRetryWithExtensionLogin(
            bool provisioningActive,
            bool alternateLoginAlreadyAttempted,
            int loginStatus,
            string currentLoginId,
            string expectedExtension)
        {
            if (!provisioningActive ||
                alternateLoginAlreadyAttempted ||
                loginStatus != -1)
            {
                return false;
            }

            string currentDigits = CentrexEventParser.DigitsOnly(currentLoginId);
            string extensionDigits = CentrexEventParser.DigitsOnly(expectedExtension);
            return extensionDigits.Length >= 2 &&
                extensionDigits.Length <= 10 &&
                !string.Equals(
                    currentDigits,
                    extensionDigits,
                    System.StringComparison.Ordinal);
        }
    }
}
