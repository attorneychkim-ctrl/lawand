using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Lawand.CentrexBridge
{
    internal sealed class ParsedCentrexEvent
    {
        private readonly IDictionary<string, string> _fields;

        public ParsedCentrexEvent(string eventName, IDictionary<string, string> fields)
        {
            EventName = eventName;
            _fields = fields;
        }

        public string EventName { get; private set; }

        public string Get(string key)
        {
            string value;
            return _fields.TryGetValue(key, out value) ? value : string.Empty;
        }
    }

    internal static class CentrexEventParser
    {
        public static ParsedCentrexEvent Parse(string raw)
        {
            string[] parts = (raw ?? string.Empty).Split('|');
            string eventName = parts.Length == 0 ? "UNKNOWN" : SafeToken(parts[0], 40);
            Dictionary<string, string> fields =
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            for (int index = 1; index < parts.Length; index++)
            {
                int separator = parts[index].IndexOf(':');
                if (separator <= 0)
                {
                    continue;
                }

                string key = SafeToken(parts[index].Substring(0, separator), 40);
                if (key.Length == 0)
                {
                    continue;
                }

                fields[key] = parts[index].Substring(separator + 1);
            }

            return new ParsedCentrexEvent(eventName, fields);
        }

        public static string SafeToken(string value, int maximumLength)
        {
            StringBuilder result = new StringBuilder();
            string source = value ?? string.Empty;
            for (int index = 0; index < source.Length && result.Length < maximumLength; index++)
            {
                char character = source[index];
                if ((character >= 'a' && character <= 'z') ||
                    (character >= 'A' && character <= 'Z') ||
                    (character >= '0' && character <= '9') ||
                    character == '_' || character == '-' || character == '.')
                {
                    result.Append(character);
                }
            }

            return result.ToString();
        }

        public static string DigitsOnly(string value)
        {
            StringBuilder digits = new StringBuilder();
            string source = value ?? string.Empty;
            for (int index = 0; index < source.Length; index++)
            {
                char character = source[index];
                if (character >= '0' && character <= '9')
                {
                    digits.Append(character);
                }
            }

            return digits.ToString();
        }

        public static string MaskPhone(string value)
        {
            string digits = DigitsOnly(value);
            if (digits.Length == 0)
            {
                return "unknown";
            }

            int start = Math.Max(0, digits.Length - 4);
            return "***" + digits.Substring(start);
        }

        public static bool EndsWithDigits(string actual, string expected)
        {
            string actualDigits = DigitsOnly(actual);
            string expectedDigits = DigitsOnly(expected);
            return expectedDigits.Length > 0 &&
                actualDigits.EndsWith(expectedDigits, StringComparison.Ordinal);
        }

        public static bool IsRelatedUniqueId(string active, string candidate)
        {
            if (string.IsNullOrWhiteSpace(active) || string.IsNullOrWhiteSpace(candidate))
            {
                return false;
            }

            if (string.Equals(active, candidate, StringComparison.Ordinal))
            {
                return true;
            }

            int activeSeparator = active.LastIndexOf('.');
            int candidateSeparator = candidate.LastIndexOf('.');
            if (activeSeparator <= 0 || candidateSeparator <= 0 ||
                !string.Equals(
                    active.Substring(0, activeSeparator),
                    candidate.Substring(0, candidateSeparator),
                    StringComparison.Ordinal))
            {
                return false;
            }

            long activeSequence;
            long candidateSequence;
            return long.TryParse(
                    active.Substring(activeSeparator + 1),
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out activeSequence) &&
                long.TryParse(
                    candidate.Substring(candidateSeparator + 1),
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out candidateSequence) &&
                Math.Abs(candidateSequence - activeSequence) == 1;
        }

        public static bool IsRelatedUniqueId(
            IEnumerable<string> activeUniqueIds,
            string candidate)
        {
            if (activeUniqueIds == null)
            {
                return false;
            }

            foreach (string activeUniqueId in activeUniqueIds)
            {
                if (IsRelatedUniqueId(activeUniqueId, candidate))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
