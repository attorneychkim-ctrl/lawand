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

        public int SchemaVersion { get; private set; }
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
        public string Direction { get; private set; }
        public string AgentExtension { get; private set; }
        public string RemotePartyKind { get; private set; }
        public string RemotePartyNumber { get; private set; }
        public string ContextProviderCallId { get; private set; }
        public string RelatedProviderCallId { get; private set; }
        public string SourceProviderCallId { get; private set; }
        public string Party1Kind { get; private set; }
        public string Party2Kind { get; private set; }
        public string Party1Number { get; private set; }
        public string Party2Number { get; private set; }
        public string ChannelKind { get; private set; }
        public string RelatedChannelKind { get; private set; }
        public string Channel1Kind { get; private set; }
        public string Channel2Kind { get; private set; }

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

        public static GatewayEventPayload ObservedRinging(
            BridgeConfiguration configuration,
            string providerCallId,
            string direction,
            string remotePartyKind,
            string remotePartyNumber,
            string incomingLineNumber,
            string contextProviderCallId,
            string channelKind,
            string relatedChannelKind)
        {
            string normalizedDirection = ValidChoice(
                direction,
                "direction",
                "inbound",
                "outbound");
            string normalizedPartyKind = ValidChoice(
                remotePartyKind,
                "remotePartyKind",
                "internal",
                "external",
                "unknown");
            string normalizedIncomingLine = null;
            if (string.Equals(normalizedDirection, "inbound", StringComparison.Ordinal))
            {
                normalizedIncomingLine = ValidPartyNumber(
                    incomingLineNumber,
                    "incomingLineNumber");
            }
            return new GatewayEventPayload
            {
                SchemaVersion = 2,
                EventId = Guid.NewGuid().ToString("D"),
                BridgeId = configuration.BridgeId,
                EndpointId = configuration.EndpointId,
                EventType = "call.ringing",
                OccurredAt = DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                ProviderCallId = ValidProviderId(providerCallId, "providerCallId"),
                Direction = normalizedDirection,
                AgentExtension = ValidExtension(configuration.ExpectedExtension),
                RemotePartyKind = normalizedPartyKind,
                RemotePartyNumber = ValidPartyNumber(remotePartyNumber, "remotePartyNumber"),
                IncomingLineNumber = normalizedIncomingLine,
                ContextProviderCallId = string.IsNullOrWhiteSpace(contextProviderCallId)
                    ? null
                    : ValidProviderId(contextProviderCallId, "contextProviderCallId"),
                ChannelKind = ValidChannelKind(channelKind),
                RelatedChannelKind = ValidChannelKind(relatedChannelKind)
            };
        }

        public static GatewayEventPayload ObservedChannels(
            BridgeConfiguration configuration,
            string providerCallId,
            string relatedProviderCallId,
            string party1Kind,
            string party2Kind,
            string party1Number,
            string party2Number,
            string channel1Kind,
            string channel2Kind)
        {
            return new GatewayEventPayload
            {
                SchemaVersion = 2,
                EventId = Guid.NewGuid().ToString("D"),
                BridgeId = configuration.BridgeId,
                EndpointId = configuration.EndpointId,
                EventType = "call.channels",
                OccurredAt = DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                ProviderCallId = ValidProviderId(providerCallId, "providerCallId"),
                RelatedProviderCallId = ValidProviderId(
                    relatedProviderCallId,
                    "relatedProviderCallId"),
                AgentExtension = ValidExtension(configuration.ExpectedExtension),
                Party1Kind = ValidChoice(
                    party1Kind,
                    "party1Kind",
                    "internal",
                    "external",
                    "unknown"),
                Party2Kind = ValidChoice(
                    party2Kind,
                    "party2Kind",
                    "internal",
                    "external",
                    "unknown"),
                Party1Number = OptionalPartyNumber(party1Number),
                Party2Number = OptionalPartyNumber(party2Number),
                Channel1Kind = ValidChannelKind(channel1Kind),
                Channel2Kind = ValidChannelKind(channel2Kind)
            };
        }

        public static GatewayEventPayload ObservedEnded(
            BridgeConfiguration configuration,
            string providerCallId,
            string sourceProviderCallId,
            string providerEndCause,
            string channelKind,
            string relatedChannelKind)
        {
            string cause = CentrexEventParser.SafeToken(providerEndCause, 30);
            if (string.IsNullOrWhiteSpace(cause))
            {
                cause = "unknown";
            }
            return new GatewayEventPayload
            {
                SchemaVersion = 2,
                EventId = Guid.NewGuid().ToString("D"),
                BridgeId = configuration.BridgeId,
                EndpointId = configuration.EndpointId,
                EventType = "call.ended",
                OccurredAt = DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                ProviderCallId = ValidProviderId(providerCallId, "providerCallId"),
                SourceProviderCallId = OptionalProviderId(sourceProviderCallId),
                AgentExtension = ValidExtension(configuration.ExpectedExtension),
                ProviderEndCause = cause,
                ChannelKind = ValidChannelKind(channelKind),
                RelatedChannelKind = ValidChannelKind(relatedChannelKind)
            };
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
                SchemaVersion = 1,
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
            value["schemaVersion"] = SchemaVersion;
            value["eventId"] = EventId;
            value["bridgeId"] = BridgeId;
            value["endpointId"] = EndpointId;
            value["eventType"] = EventType;
            value["occurredAt"] = OccurredAt;
            value["providerCallId"] = ProviderCallId;
            if (CallerNumber != null)
            {
                value["callerNumber"] = CallerNumber;
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
            Add(value, "direction", Direction);
            Add(value, "agentExtension", AgentExtension);
            Add(value, "remotePartyKind", RemotePartyKind);
            Add(value, "remotePartyNumber", RemotePartyNumber);
            Add(value, "incomingLineNumber", IncomingLineNumber);
            Add(value, "contextProviderCallId", ContextProviderCallId);
            Add(value, "relatedProviderCallId", RelatedProviderCallId);
            Add(value, "sourceProviderCallId", SourceProviderCallId);
            Add(value, "party1Kind", Party1Kind);
            Add(value, "party2Kind", Party2Kind);
            Add(value, "party1Number", Party1Number);
            Add(value, "party2Number", Party2Number);
            Add(value, "channelKind", ChannelKind);
            Add(value, "relatedChannelKind", RelatedChannelKind);
            Add(value, "channel1Kind", Channel1Kind);
            Add(value, "channel2Kind", Channel2Kind);
            return new JavaScriptSerializer().Serialize(value);
        }

        private static void Add(
            IDictionary<string, object> target,
            string key,
            string value)
        {
            if (value != null)
            {
                target[key] = value;
            }
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

        private static string ValidPartyNumber(string value, string field)
        {
            string digits = CentrexEventParser.DigitsOnly(value);
            if (digits.Length < 2 || digits.Length > 20)
            {
                throw new ArgumentException(field + " 형식이 올바르지 않습니다.");
            }
            return digits;
        }

        private static string OptionalPartyNumber(string value)
        {
            string digits = CentrexEventParser.DigitsOnly(value);
            return digits.Length >= 2 && digits.Length <= 20 ? digits : null;
        }

        private static string OptionalProviderId(string value)
        {
            string safe = CentrexEventParser.SafeToken(value, 100);
            return ProviderIdPattern.IsMatch(safe) && safe != "0" ? safe : null;
        }

        private static string ValidExtension(string value)
        {
            string digits = CentrexEventParser.DigitsOnly(value);
            if (digits.Length < 2 || digits.Length > 10)
            {
                throw new ArgumentException("agentExtension 형식이 올바르지 않습니다.");
            }
            return digits;
        }

        private static string ValidChannelKind(string value)
        {
            return ValidChoice(
                value,
                "channelKind",
                "sip",
                "pjsip",
                "local",
                "local_xfer",
                "other",
                "none");
        }

        private static string ValidChoice(
            string value,
            string field,
            params string[] allowed)
        {
            foreach (string candidate in allowed)
            {
                if (string.Equals(value, candidate, StringComparison.Ordinal))
                {
                    return candidate;
                }
            }
            throw new ArgumentException(field + " 형식이 올바르지 않습니다.");
        }
    }
}
