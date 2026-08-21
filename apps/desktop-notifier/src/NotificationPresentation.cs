using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Text;

namespace Lawand.DesktopNotifier
{
    internal enum NotificationKind
    {
        Consultation,
        Message,
        Review,
        ExternalPhone,
        InternalPhone,
        Transfer,
        Test,
        Summary,
        System
    }

    internal sealed class NotificationPresentation
    {
        private NotificationPresentation(
            NotificationKind kind,
            string label,
            string glyph,
            string openActionText,
            Color accentColor,
            Color tintColor,
            Size popupSize,
            int autoDismissMilliseconds,
            bool realtime,
            bool pauseOnHover)
        {
            Kind = kind;
            Label = label;
            Glyph = glyph;
            OpenActionText = openActionText;
            AccentColor = accentColor;
            TintColor = tintColor;
            PopupSize = popupSize;
            AutoDismissMilliseconds = autoDismissMilliseconds;
            Realtime = realtime;
            PauseOnHover = pauseOnHover;
        }

        public NotificationKind Kind { get; private set; }
        public string Label { get; private set; }
        public string Glyph { get; private set; }
        public string OpenActionText { get; private set; }
        public Color AccentColor { get; private set; }
        public Color TintColor { get; private set; }
        public Size PopupSize { get; private set; }
        public int AutoDismissMilliseconds { get; private set; }
        public bool Realtime { get; private set; }
        public bool PauseOnHover { get; private set; }

        public static NotificationPresentation Resolve(
            string eventType,
            string category)
        {
            string normalizedEventType = (eventType ?? string.Empty).Trim();
            string normalizedCategory = (category ?? string.Empty).Trim();

            if (string.Equals(
                normalizedEventType,
                "desktop.phone.internal_inbound",
                StringComparison.Ordinal))
            {
                return ForKind(NotificationKind.InternalPhone);
            }
            if (string.Equals(
                    normalizedEventType,
                    "desktop.phone.transferred_customer",
                    StringComparison.Ordinal) ||
                string.Equals(
                    normalizedEventType,
                    "desktop.phone.transfer_returned",
                    StringComparison.Ordinal))
            {
                return ForKind(NotificationKind.Transfer);
            }
            if (normalizedEventType.StartsWith(
                "desktop.phone.",
                StringComparison.Ordinal))
            {
                return ForKind(NotificationKind.ExternalPhone);
            }
            if (normalizedEventType.StartsWith(
                    "desktop.consultation.",
                    StringComparison.Ordinal) ||
                string.Equals(
                    normalizedCategory,
                    "consultation",
                    StringComparison.OrdinalIgnoreCase))
            {
                return ForKind(NotificationKind.Consultation);
            }
            if (normalizedEventType.StartsWith(
                    "desktop.message_",
                    StringComparison.Ordinal) ||
                string.Equals(
                    normalizedCategory,
                    "message",
                    StringComparison.OrdinalIgnoreCase))
            {
                return ForKind(NotificationKind.Message);
            }
            if (normalizedEventType.StartsWith(
                    "desktop.review.",
                    StringComparison.Ordinal) ||
                string.Equals(
                    normalizedCategory,
                    "review",
                    StringComparison.OrdinalIgnoreCase))
            {
                return ForKind(NotificationKind.Review);
            }
            if (string.Equals(
                    normalizedEventType,
                    "desktop.test",
                    StringComparison.Ordinal) ||
                string.Equals(
                    normalizedCategory,
                    "test",
                    StringComparison.OrdinalIgnoreCase))
            {
                return ForKind(NotificationKind.Test);
            }
            if (string.Equals(
                normalizedCategory,
                "phone",
                StringComparison.OrdinalIgnoreCase))
            {
                return ForKind(NotificationKind.ExternalPhone);
            }
            return ForKind(NotificationKind.System);
        }

        public static NotificationPresentation ForKind(NotificationKind kind)
        {
            switch (kind)
            {
                case NotificationKind.Consultation:
                    return new NotificationPresentation(
                        kind,
                        "상담",
                        "상",
                        "상담 열기",
                        Color.FromArgb(59, 130, 246),
                        Color.FromArgb(232, 242, 255),
                        new Size(540, 420),
                        25000,
                        false,
                        true);
                case NotificationKind.Message:
                    return new NotificationPresentation(
                        kind,
                        "문자",
                        "문",
                        "문자 열기",
                        Color.FromArgb(16, 185, 129),
                        Color.FromArgb(229, 250, 242),
                        new Size(560, 380),
                        30000,
                        false,
                        true);
                case NotificationKind.Review:
                    return new NotificationPresentation(
                        kind,
                        "후기",
                        "후",
                        "후기 열기",
                        Color.FromArgb(139, 92, 246),
                        Color.FromArgb(242, 237, 255),
                        new Size(560, 400),
                        30000,
                        false,
                        true);
                case NotificationKind.ExternalPhone:
                    return new NotificationPresentation(
                        kind,
                        "고객 전화",
                        "☎",
                        "전화 화면 열기",
                        Color.FromArgb(244, 63, 94),
                        Color.FromArgb(255, 234, 239),
                        new Size(620, 400),
                        120000,
                        true,
                        false);
                case NotificationKind.InternalPhone:
                    return new NotificationPresentation(
                        kind,
                        "내선",
                        "내",
                        "전화 화면 열기",
                        Color.FromArgb(245, 158, 11),
                        Color.FromArgb(255, 246, 220),
                        new Size(480, 360),
                        120000,
                        true,
                        false);
                case NotificationKind.Transfer:
                    return new NotificationPresentation(
                        kind,
                        "호전환",
                        "↔",
                        "호전환 화면 열기",
                        Color.FromArgb(236, 72, 153),
                        Color.FromArgb(255, 234, 246),
                        new Size(620, 420),
                        120000,
                        true,
                        false);
                case NotificationKind.Test:
                    return new NotificationPresentation(
                        kind,
                        "테스트",
                        "✓",
                        "설정 열기",
                        Color.FromArgb(14, 165, 164),
                        Color.FromArgb(229, 251, 249),
                        new Size(540, 380),
                        20000,
                        false,
                        true);
                case NotificationKind.Summary:
                    return new NotificationPresentation(
                        kind,
                        "부재중 알림",
                        "+",
                        "ERP 업무 열기",
                        Color.FromArgb(79, 70, 229),
                        Color.FromArgb(235, 235, 255),
                        new Size(580, 340),
                        0,
                        false,
                        false);
                default:
                    return new NotificationPresentation(
                        NotificationKind.System,
                        "LAW& OS",
                        "i",
                        "설정 열기",
                        Color.FromArgb(71, 85, 105),
                        Color.FromArgb(238, 242, 247),
                        new Size(500, 300),
                        15000,
                        false,
                        true);
            }
        }

        public static NotificationPresentation SystemWarning()
        {
            return new NotificationPresentation(
                NotificationKind.System,
                "연결 확인",
                "!",
                "설정 열기",
                Color.FromArgb(225, 29, 72),
                Color.FromArgb(255, 235, 239),
                new Size(510, 310),
                0,
                false,
                false);
        }

        public static string KindLabel(NotificationKind kind)
        {
            switch (kind)
            {
                case NotificationKind.Consultation:
                    return "상담";
                case NotificationKind.Message:
                    return "문자";
                case NotificationKind.Review:
                    return "후기";
                case NotificationKind.ExternalPhone:
                    return "고객 전화";
                case NotificationKind.InternalPhone:
                    return "내선";
                case NotificationKind.Transfer:
                    return "호전환";
                case NotificationKind.Test:
                    return "테스트";
                default:
                    return "기타";
            }
        }

        public static int CountNotifications(
            IDictionary<NotificationKind, int> counts)
        {
            int total = 0;
            if (counts == null)
            {
                return total;
            }
            foreach (KeyValuePair<NotificationKind, int> pair in counts)
            {
                if (pair.Value > 0)
                {
                    total += pair.Value;
                }
            }
            return total;
        }

        public static string SummaryBody(
            IDictionary<NotificationKind, int> counts)
        {
            NotificationKind[] order = new NotificationKind[]
            {
                NotificationKind.ExternalPhone,
                NotificationKind.Transfer,
                NotificationKind.InternalPhone,
                NotificationKind.Consultation,
                NotificationKind.Message,
                NotificationKind.Review,
                NotificationKind.Test,
                NotificationKind.System
            };
            StringBuilder body = new StringBuilder();
            foreach (NotificationKind kind in order)
            {
                int count;
                if (counts != null && counts.TryGetValue(kind, out count) && count > 0)
                {
                    if (body.Length > 0)
                    {
                        body.Append("  ·  ");
                    }
                    body.Append(KindLabel(kind));
                    body.Append(' ');
                    body.Append(count);
                    body.Append("건");
                }
            }
            return body.Length > 0
                ? body.ToString()
                : "새 업무 알림을 ERP에서 확인해 주세요.";
        }
    }

    internal sealed class NotificationBodyItem
    {
        public NotificationBodyItem(string label, string value)
        {
            Label = label;
            Value = value;
        }

        public string Label { get; private set; }
        public string Value { get; private set; }
    }

    internal static class NotificationBodyFormatter
    {
        public static IList<NotificationBodyItem> Build(
            NotificationKind kind,
            string body)
        {
            List<string> lines = Lines(body);
            List<NotificationBodyItem> items = new List<NotificationBodyItem>();
            string firstLabel;
            string firstValue;
            if (lines.Count > 0 && TrySplitLabeledLine(
                lines[0],
                out firstLabel,
                out firstValue))
            {
                items.Add(new NotificationBodyItem(firstLabel, firstValue));
                for (int index = 1; index < lines.Count; index++)
                {
                    string label;
                    string value;
                    if (TrySplitLabeledLine(lines[index], out label, out value))
                    {
                        Add(items, label, value);
                    }
                    else if (items.Count > 0)
                    {
                        NotificationBodyItem previous = items[items.Count - 1];
                        items[items.Count - 1] = new NotificationBodyItem(
                            previous.Label,
                            previous.Value + " " + lines[index]);
                    }
                }
            }
            else if (kind == NotificationKind.Message)
            {
                Add(items, "연락처", Line(lines, 0));
                Add(items, "문자 내용", JoinFrom(lines, 1));
            }
            else if (kind == NotificationKind.Review)
            {
                Add(items, "접수", Line(lines, 0));
                Add(items, "사건", Line(lines, 1));
                Add(items, "후기 내용", JoinFrom(lines, 2));
            }
            else if (kind == NotificationKind.ExternalPhone ||
                kind == NotificationKind.Transfer)
            {
                Add(items, "전화번호", Line(lines, 0));
                Add(
                    items,
                    "수신 회선",
                    RemovePrefix(Line(lines, 1), "수신 회선 "));
            }
            else if (kind == NotificationKind.InternalPhone)
            {
                string value = Line(lines, 0);
                string[] parts = value.Split(
                    new string[] { " · " },
                    StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length > 0)
                {
                    Add(items, "수신", RemovePrefix(parts[0], "수신 "));
                }
                if (parts.Length > 1)
                {
                    Add(items, "내선", RemovePrefix(parts[1], "내선 "));
                }
            }
            else if (kind == NotificationKind.Consultation)
            {
                Add(items, "연락·채널", Line(lines, 0));
                for (int index = 1; index < lines.Count; index++)
                {
                    string label;
                    string value;
                    SplitLabeledLine(lines[index], "상담 내용", out label, out value);
                    Add(items, label, value);
                }
            }
            else if (kind == NotificationKind.Summary)
            {
                string[] parts = string.Join(" ", lines.ToArray()).Split(
                    new string[] { "  ·  " },
                    StringSplitOptions.RemoveEmptyEntries);
                foreach (string part in parts)
                {
                    int separator = part.LastIndexOf(' ');
                    if (separator > 0)
                    {
                        Add(
                            items,
                            part.Substring(0, separator),
                            part.Substring(separator + 1));
                    }
                    else
                    {
                        Add(items, "알림", part);
                    }
                }
            }
            else if (kind == NotificationKind.Test)
            {
                Add(items, "테스트 고객", Line(lines, 0));
                Add(items, "테스트 내용", JoinFrom(lines, 1));
            }
            else
            {
                Add(items, "안내", string.Join(" ", lines.ToArray()));
            }

            if (items.Count == 0)
            {
                items.Add(new NotificationBodyItem(
                    "업무",
                    "새 업무 알림이 도착했습니다. ERP에서 확인하세요."));
            }
            int maximum;
            switch (kind)
            {
                case NotificationKind.Consultation:
                case NotificationKind.Summary:
                    maximum = 6;
                    break;
                case NotificationKind.ExternalPhone:
                case NotificationKind.Transfer:
                    maximum = 5;
                    break;
                case NotificationKind.Message:
                case NotificationKind.Review:
                case NotificationKind.InternalPhone:
                    maximum = 4;
                    break;
                case NotificationKind.Test:
                    maximum = 4;
                    break;
                default:
                    maximum = 3;
                    break;
            }
            if (items.Count <= maximum)
            {
                return items;
            }
            int hidden = items.Count - maximum;
            List<NotificationBodyItem> limited = items.Take(maximum).ToList();
            NotificationBodyItem last = limited[limited.Count - 1];
            limited[limited.Count - 1] = new NotificationBodyItem(
                last.Label,
                last.Value + "  ·  외 " + hidden + "개 항목");
            return limited;
        }

        private static List<string> Lines(string value)
        {
            string normalized = (value ?? string.Empty)
                .Replace("\r\n", "\n")
                .Replace('\r', '\n');
            return normalized
                .Split(new char[] { '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(line => line.Trim())
                .Where(line => line.Length > 0)
                .ToList();
        }

        private static string Line(IList<string> lines, int index)
        {
            return lines != null && index >= 0 && index < lines.Count
                ? lines[index]
                : string.Empty;
        }

        private static string JoinFrom(IList<string> lines, int index)
        {
            if (lines == null || index < 0 || index >= lines.Count)
            {
                return string.Empty;
            }
            return string.Join(" ", lines.Skip(index).ToArray());
        }

        private static string RemovePrefix(string value, string prefix)
        {
            string normalized = (value ?? string.Empty).Trim();
            return normalized.StartsWith(prefix, StringComparison.Ordinal)
                ? normalized.Substring(prefix.Length).Trim()
                : normalized;
        }

        private static void SplitLabeledLine(
            string line,
            string fallbackLabel,
            out string label,
            out string value)
        {
            string normalized = (line ?? string.Empty).Trim();
            int separator = normalized.IndexOf(": ", StringComparison.Ordinal);
            if (separator > 0 && separator <= 20)
            {
                label = normalized.Substring(0, separator).Trim();
                value = normalized.Substring(separator + 2).Trim();
                return;
            }
            label = fallbackLabel;
            value = normalized;
        }

        private static bool TrySplitLabeledLine(
            string line,
            out string label,
            out string value)
        {
            string normalized = (line ?? string.Empty).Trim();
            int separator = normalized.IndexOf(": ", StringComparison.Ordinal);
            if (separator <= 0 || separator > 20)
            {
                label = string.Empty;
                value = normalized;
                return false;
            }
            label = normalized.Substring(0, separator).Trim();
            value = normalized.Substring(separator + 2).Trim();
            return label.Length > 0 && value.Length > 0;
        }

        private static void Add(
            ICollection<NotificationBodyItem> items,
            string label,
            string value)
        {
            string normalized = (value ?? string.Empty).Trim();
            if (normalized.Length > 0)
            {
                items.Add(new NotificationBodyItem(label, normalized));
            }
        }
    }
}
