using System;

namespace Lawand.CentrexBridge
{
    internal static class CallObservationExpiryPolicy
    {
        private static readonly TimeSpan RingingMaximumAge =
            TimeSpan.FromMinutes(3);

        public static bool ShouldExpire(
            bool connectedEventSent,
            DateTimeOffset ringingAt,
            DateTimeOffset currentTime)
        {
            return !connectedEventSent &&
                ringingAt != default(DateTimeOffset) &&
                currentTime - ringingAt >= RingingMaximumAge;
        }
    }
}
