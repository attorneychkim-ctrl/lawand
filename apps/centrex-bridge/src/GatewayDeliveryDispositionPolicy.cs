using System;

namespace Lawand.CentrexBridge
{
    internal static class GatewayDeliveryDispositionPolicy
    {
        private static readonly TimeSpan PermanentFailureGrace =
            TimeSpan.FromMinutes(1);

        public static bool ShouldDeadLetter(
            int statusCode,
            DateTime createdAtUtc,
            DateTime nowUtc)
        {
            if (statusCode != 400 &&
                statusCode != 404 &&
                statusCode != 409 &&
                statusCode != 422)
            {
                return false;
            }

            return nowUtc >= createdAtUtc.Add(PermanentFailureGrace);
        }

        public static bool ShouldContinueQueue(int statusCode)
        {
            return statusCode == 400 ||
                statusCode == 404 ||
                statusCode == 409 ||
                statusCode == 422;
        }
    }
}
