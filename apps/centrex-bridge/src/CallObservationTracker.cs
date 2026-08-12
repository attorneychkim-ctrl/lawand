using System;
using System.Collections.Generic;

namespace Lawand.CentrexBridge
{
    internal sealed class TrackedCallObservation
    {
        public TrackedCallObservation(
            string providerCallId,
            DateTimeOffset ringingAt,
            string channelKind,
            string relatedChannelKind)
        {
            ProviderCallId = providerCallId;
            RingingAt = ringingAt;
            ChannelKind = channelKind;
            RelatedChannelKind = relatedChannelKind;
            ProviderIds = new HashSet<string>(StringComparer.Ordinal)
            {
                providerCallId
            };
        }

        public string ProviderCallId { get; private set; }
        public DateTimeOffset RingingAt { get; private set; }
        public string ChannelKind { get; private set; }
        public string RelatedChannelKind { get; private set; }
        public HashSet<string> ProviderIds { get; private set; }
        public bool Connected { get; set; }
    }

    internal sealed class CallObservationTracker
    {
        private static readonly TimeSpan RingingMaximumAge =
            TimeSpan.FromMinutes(3);
        private readonly Dictionary<string, TrackedCallObservation> _calls =
            new Dictionary<string, TrackedCallObservation>(StringComparer.Ordinal);

        public int Count
        {
            get { return _calls.Count; }
        }

        public void TrackRinging(
            string providerCallId,
            DateTimeOffset ringingAt,
            string channelKind,
            string relatedChannelKind)
        {
            if (string.IsNullOrWhiteSpace(providerCallId))
            {
                return;
            }
            if (!_calls.ContainsKey(providerCallId))
            {
                _calls.Add(
                    providerCallId,
                    new TrackedCallObservation(
                        providerCallId,
                        ringingAt,
                        channelKind,
                        relatedChannelKind));
            }
        }

        public int MarkConnected(string providerCallId, string relatedProviderCallId)
        {
            int matched = 0;
            foreach (TrackedCallObservation call in _calls.Values)
            {
                if (!Matches(call, providerCallId) &&
                    !Matches(call, relatedProviderCallId))
                {
                    continue;
                }
                Add(call.ProviderIds, providerCallId);
                Add(call.ProviderIds, relatedProviderCallId);
                call.Connected = true;
                matched++;
            }
            return matched;
        }

        public int RemoveRelated(string providerCallId, string sourceProviderCallId)
        {
            List<string> matches = new List<string>();
            foreach (KeyValuePair<string, TrackedCallObservation> pair in _calls)
            {
                if (Matches(pair.Value, providerCallId) ||
                    Matches(pair.Value, sourceProviderCallId))
                {
                    matches.Add(pair.Key);
                }
            }
            foreach (string key in matches)
            {
                _calls.Remove(key);
            }
            return matches.Count;
        }

        public IList<TrackedCallObservation> TakeExpiredUnconnected(
            DateTimeOffset currentTime)
        {
            List<string> keys = new List<string>();
            List<TrackedCallObservation> expired =
                new List<TrackedCallObservation>();
            foreach (KeyValuePair<string, TrackedCallObservation> pair in _calls)
            {
                if (!pair.Value.Connected &&
                    currentTime - pair.Value.RingingAt >= RingingMaximumAge)
                {
                    keys.Add(pair.Key);
                    expired.Add(pair.Value);
                }
            }
            foreach (string key in keys)
            {
                _calls.Remove(key);
            }
            return expired;
        }

        public IList<TrackedCallObservation> Drain()
        {
            List<TrackedCallObservation> active =
                new List<TrackedCallObservation>(_calls.Values);
            _calls.Clear();
            return active;
        }

        private static bool Matches(TrackedCallObservation call, string candidate)
        {
            return !string.IsNullOrWhiteSpace(candidate) &&
                CentrexEventParser.IsRelatedUniqueId(call.ProviderIds, candidate);
        }

        private static void Add(ISet<string> values, string value)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                values.Add(value);
            }
        }
    }
}
