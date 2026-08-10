using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Lawand.CentrexBridge
{
    internal sealed class GatewayEventPayload
    {
        private static readonly Regex ProviderIdPattern = new Regex(
            "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$",
            RegexOptions.CultureInvariant);

        private GatewayEventPayload()
        {
        }

        public string EventId { get; private set; }
        public string BridgeId { get; private set; }
        public string EndpointId { get; private set; }
        public string EventType { get; private set; }
        public string OccurredAt { get; private set; }
        public string ProviderCallId { get; private set; }
        public string CallerNumber { get; private set; }
        public string IncomingLineNumber { get; private set; }
        public string CalledNumber { get; private set; }
        public string ProviderChannelId { get; private set; }
        public string ProviderEndCause { get; private set; }

        public static GatewayEventPayload Ringing(
            BridgeConfiguration configuration,
            string providerCallId,
            string callerNumber,
            string incomingLineNumber)
        {
            string callerDigits = ValidPhone(callerNumber, "callerNumber");
            string lineDigits = ValidPhone(incomingLineNumber, "incomingLineNumber");
            return Create(
                configuration,
                "inbound.ringing",
                providerCallId,
                callerDigits,
                lineDigits,
                null,
                null,
                null);
        }

        public static GatewayEventPayload Connected(
            BridgeConfiguration configuration,
            string providerCallId,
            string providerChannelId)
        {
            return Create(
                configuration,
                "inbound.connected",
                providerCallId,
                null,
                null,
                null,
                string.IsNullOrWhiteSpace(providerChannelId)
                    ? null
                    : ValidProviderId(providerChannelId, "providerChannelId"),
                null);
        }

        public static GatewayEventPayload Ended(
            BridgeConfiguration configuration,
            string providerCallId,
            string providerEndCause)
        {
            string cause = CentrexEventParser.SafeToken(providerEndCause, 30);
            if (string.IsNullOrWhiteSpace(cause))
            {
                cause = "unknown";
            }
            return Create(
                configuration,
                "inbound.ended",
                providerCallId,
                null,
                null,
                null,
                null,
                cause);
        }

        public static GatewayEventPayload OutboundRinging(
            BridgeConfiguration configuration,
            string providerCallId,
            string calledNumber)
        {
            return Create(
                configuration,
                "outbound.ringing",
                providerCallId,
                null,
                null,
                ValidPhone(calledNumber, "calledNumber"),
                null,
                null);
        }

        public static GatewayEventPayload OutboundConnected(
            BridgeConfiguration configuration,
            string providerCallId,
            string providerChannelId)
        {
            return Create(
                configuration,
                "outbound.connected",
                providerCallId,
                null,
                null,
                null,
                string.IsNullOrWhiteSpace(providerChannelId)
                    ? null
                    : ValidProviderId(providerChannelId, "providerChannelId"),
                null);
        }

        public static GatewayEventPayload OutboundEnded(
            BridgeConfiguration configuration,
            string providerCallId,
            string providerEndCause)
        {
            string cause = CentrexEventParser.SafeToken(providerEndCause, 30);
            if (string.IsNullOrWhiteSpace(cause))
            {
                cause = "unknown";
            }
            return Create(
                configuration,
                "outbound.ended",
                providerCallId,
                null,
                null,
                null,
                null,
                cause);
        }

        private static GatewayEventPayload Create(
            BridgeConfiguration configuration,
            string eventType,
            string providerCallId,
            string callerNumber,
            string incomingLineNumber,
            string calledNumber,
            string providerChannelId,
            string providerEndCause)
        {
            return new GatewayEventPayload
            {
                EventId = Guid.NewGuid().ToString("D"),
                BridgeId = configuration.BridgeId,
                EndpointId = configuration.EndpointId,
                EventType = eventType,
                OccurredAt = DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                ProviderCallId = ValidProviderId(providerCallId, "providerCallId"),
                CallerNumber = callerNumber,
                IncomingLineNumber = incomingLineNumber,
                CalledNumber = calledNumber,
                ProviderChannelId = providerChannelId,
                ProviderEndCause = providerEndCause
            };
        }

        public string ToJson()
        {
            Dictionary<string, object> value = new Dictionary<string, object>();
            value["schemaVersion"] = 1;
            value["eventId"] = EventId;
            value["bridgeId"] = BridgeId;
            value["endpointId"] = EndpointId;
            value["eventType"] = EventType;
            value["occurredAt"] = OccurredAt;
            value["providerCallId"] = ProviderCallId;
            if (CallerNumber != null)
            {
                value["callerNumber"] = CallerNumber;
                value["incomingLineNumber"] = IncomingLineNumber;
            }
            if (CalledNumber != null)
            {
                value["calledNumber"] = CalledNumber;
            }
            if (ProviderChannelId != null)
            {
                value["providerChannelId"] = ProviderChannelId;
            }
            if (ProviderEndCause != null)
            {
                value["providerEndCause"] = ProviderEndCause;
            }
            return new JavaScriptSerializer().Serialize(value);
        }

        private static string ValidProviderId(string value, string field)
        {
            string safe = CentrexEventParser.SafeToken(value, 100);
            if (!ProviderIdPattern.IsMatch(safe))
            {
                throw new ArgumentException(field + " 형식이 올바르지 않습니다.");
            }
            return safe;
        }

        private static string ValidPhone(string value, string field)
        {
            string digits = CentrexEventParser.DigitsOnly(value);
            if (digits.Length < 8 || digits.Length > 20)
            {
                throw new ArgumentException(field + " 형식이 올바르지 않습니다.");
            }
            return digits;
        }
    }
}
