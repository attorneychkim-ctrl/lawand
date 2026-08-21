using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace Lawand.DesktopNotifier
{
    internal sealed class NotificationPopupManager : IDisposable
    {
        private const int MaximumVisiblePopups = 3;
        private const int PopupGap = 12;
        private const int ScreenMargin = 18;

        private sealed class PopupEntry
        {
            public NotificationPopupForm Window;
            public NotificationKind Kind;
            public DesktopDelivery Delivery;
            public Dictionary<NotificationKind, int> SummaryCounts;
        }

        private sealed class PendingSystemMessage
        {
            public string Title;
            public string Body;
            public bool Warning;
        }

        private readonly List<PopupEntry> visible;
        private readonly Dictionary<NotificationKind, int> accumulatedCounts;
        private Screen targetScreen;
        private PendingSystemMessage pendingSystemMessage;
        private bool accumulatedWhileAway;
        private bool suspended;
        private bool suppressClosedHandling;
        private bool disposed;

        public NotificationPopupManager()
        {
            visible = new List<PopupEntry>();
            accumulatedCounts = new Dictionary<NotificationKind, int>();
        }

        public event Action<DesktopDelivery> DeliveryOpenRequested;
        public event Action ErpOpenRequested;
        public event Action SettingsOpenRequested;

        public bool IsSuspended
        {
            get { return suspended; }
        }

        public void ShowDelivery(DesktopDelivery delivery, string body)
        {
            if (disposed || delivery == null || delivery.payload == null)
            {
                return;
            }
            NotificationPresentation presentation = NotificationPresentation.Resolve(
                delivery.eventType,
                delivery.payload.category);
            if (suspended)
            {
                Accumulate(presentation.Kind, 1);
                accumulatedWhileAway = true;
                return;
            }

            int dismissAfterMilliseconds = DismissAfterMilliseconds(
                presentation,
                delivery.expiresAt);
            PopupEntry entry = new PopupEntry();
            entry.Kind = presentation.Kind;
            entry.Delivery = delivery;
            bool shown = TryShow(
                entry,
                presentation,
                delivery.payload.title,
                body,
                presentation.Realtime
                    ? "실시간 · 직접 닫거나 2분 후 정리"
                    : "잠시 후 자동으로 닫힘",
                presentation.OpenActionText,
                dismissAfterMilliseconds,
                delegate
                {
                    Action<DesktopDelivery> handler = DeliveryOpenRequested;
                    if (handler != null)
                    {
                        handler(delivery);
                    }
                });
            if (!shown)
            {
                Accumulate(presentation.Kind, 1);
                RefreshOverflowBadge();
            }
        }

        public void ShowSystemMessage(string title, string body, bool warning)
        {
            if (disposed)
            {
                return;
            }
            PendingSystemMessage message = new PendingSystemMessage();
            message.Title = title;
            message.Body = body;
            message.Warning = warning;
            if (suspended || !TryShowSystemMessage(message))
            {
                pendingSystemMessage = message;
            }
        }

        public void SuspendForAway()
        {
            if (disposed || suspended)
            {
                return;
            }
            suspended = true;
            accumulatedWhileAway = true;
            foreach (PopupEntry entry in visible.ToArray())
            {
                if (entry.SummaryCounts != null)
                {
                    MergeCounts(entry.SummaryCounts);
                }
                else if (entry.Delivery != null)
                {
                    Accumulate(entry.Kind, 1);
                }
            }
            CloseVisiblePopups();
        }

        public void ResumeFromAway()
        {
            if (disposed || !suspended)
            {
                return;
            }
            suspended = false;
            if (pendingSystemMessage != null)
            {
                PendingSystemMessage message = pendingSystemMessage;
                pendingSystemMessage = null;
                if (!TryShowSystemMessage(message))
                {
                    pendingSystemMessage = message;
                }
            }
            TryShowSummary();
        }

        public void Clear()
        {
            if (disposed)
            {
                return;
            }
            accumulatedCounts.Clear();
            accumulatedWhileAway = false;
            pendingSystemMessage = null;
            CloseVisiblePopups();
        }

        public void Dispose()
        {
            if (disposed)
            {
                return;
            }
            Clear();
            disposed = true;
        }

        private bool TryShowSystemMessage(PendingSystemMessage message)
        {
            NotificationPresentation presentation = message.Warning
                ? NotificationPresentation.SystemWarning()
                : NotificationPresentation.ForKind(NotificationKind.System);
            PopupEntry entry = new PopupEntry();
            entry.Kind = NotificationKind.System;
            return TryShow(
                entry,
                presentation,
                message.Title,
                message.Body,
                message.Warning ? "연결할 때까지 유지" : "잠시 후 자동으로 닫힘",
                presentation.OpenActionText,
                presentation.AutoDismissMilliseconds,
                RaiseSettingsOpenRequested);
        }

        private bool TryShowSummary()
        {
            int total = NotificationPresentation.CountNotifications(
                accumulatedCounts);
            if (suspended || total == 0)
            {
                RefreshOverflowBadge();
                return false;
            }

            NotificationPresentation presentation =
                NotificationPresentation.ForKind(NotificationKind.Summary);
            Dictionary<NotificationKind, int> summaryCounts =
                new Dictionary<NotificationKind, int>(accumulatedCounts);
            bool fromAway = accumulatedWhileAway;
            PopupEntry entry = new PopupEntry();
            entry.Kind = NotificationKind.Summary;
            entry.SummaryCounts = summaryCounts;
            bool shown = TryShow(
                entry,
                presentation,
                fromAway
                    ? "자리 비운 동안 알림 " + total + "건"
                    : "알림 " + total + "건을 한 번에 모았습니다",
                NotificationPresentation.SummaryBody(summaryCounts),
                fromAway
                    ? "한 장만 확인하면 됩니다"
                    : "추가 알림을 한 장으로 묶었습니다",
                presentation.OpenActionText,
                0,
                RaiseErpOpenRequested);
            if (!shown)
            {
                RefreshOverflowBadge();
                return false;
            }
            accumulatedCounts.Clear();
            accumulatedWhileAway = false;
            RefreshOverflowBadge();
            return true;
        }

        private bool TryShow(
            PopupEntry entry,
            NotificationPresentation presentation,
            string title,
            string body,
            string statusText,
            string actionText,
            int dismissAfterMilliseconds,
            Action openAction)
        {
            if (!CanFit(presentation.PopupSize))
            {
                return false;
            }
            NotificationPopupForm window = new NotificationPopupForm(
                presentation,
                title,
                body,
                statusText,
                actionText,
                dismissAfterMilliseconds);
            entry.Window = window;
            window.OpenRequested += openAction;
            window.PopupClosed += PopupClosed;
            visible.Add(entry);
            Reposition();
            try
            {
                window.Show();
                return true;
            }
            catch
            {
                visible.Remove(entry);
                window.Close();
                if (visible.Count == 0)
                {
                    targetScreen = null;
                }
                Reposition();
                return false;
            }
        }

        private bool CanFit(Size popupSize)
        {
            if (visible.Count >= MaximumVisiblePopups)
            {
                return false;
            }
            EnsureTargetScreen();
            int usedHeight = visible.Sum(entry => entry.Window.Height);
            if (visible.Count > 0)
            {
                usedHeight += visible.Count * PopupGap;
            }
            usedHeight += popupSize.Height;
            return usedHeight <= targetScreen.WorkingArea.Height - (ScreenMargin * 2);
        }

        private void EnsureTargetScreen()
        {
            if (targetScreen == null)
            {
                targetScreen = Screen.FromPoint(Cursor.Position);
            }
        }

        private void Reposition()
        {
            if (visible.Count == 0)
            {
                targetScreen = null;
                return;
            }
            EnsureTargetScreen();
            Rectangle workingArea = targetScreen.WorkingArea;
            int top = workingArea.Top + ScreenMargin;
            foreach (PopupEntry entry in visible)
            {
                entry.Window.Left = workingArea.Right - entry.Window.Width - ScreenMargin;
                entry.Window.Top = top;
                top += entry.Window.Height + PopupGap;
            }
        }

        private void PopupClosed(NotificationPopupForm window)
        {
            PopupEntry entry = visible.FirstOrDefault(
                item => object.ReferenceEquals(item.Window, window));
            if (entry != null)
            {
                visible.Remove(entry);
            }
            if (visible.Count == 0)
            {
                targetScreen = null;
            }
            if (suppressClosedHandling)
            {
                return;
            }
            Reposition();
            if (!suspended)
            {
                if (pendingSystemMessage != null)
                {
                    PendingSystemMessage message = pendingSystemMessage;
                    pendingSystemMessage = null;
                    if (!TryShowSystemMessage(message))
                    {
                        pendingSystemMessage = message;
                    }
                }
                TryShowSummary();
            }
        }

        private void CloseVisiblePopups()
        {
            suppressClosedHandling = true;
            PopupEntry[] entries = visible.ToArray();
            visible.Clear();
            try
            {
                foreach (PopupEntry entry in entries)
                {
                    entry.Window.Close();
                }
            }
            finally
            {
                suppressClosedHandling = false;
                targetScreen = null;
            }
        }

        private void Accumulate(NotificationKind kind, int count)
        {
            int current;
            accumulatedCounts.TryGetValue(kind, out current);
            accumulatedCounts[kind] = current + Math.Max(0, count);
        }

        private void MergeCounts(IDictionary<NotificationKind, int> counts)
        {
            foreach (KeyValuePair<NotificationKind, int> pair in counts)
            {
                Accumulate(pair.Key, pair.Value);
            }
        }

        private void RefreshOverflowBadge()
        {
            foreach (PopupEntry entry in visible)
            {
                entry.Window.SetOverflowCount(0);
            }
            int total = NotificationPresentation.CountNotifications(
                accumulatedCounts);
            if (total > 0 && visible.Count > 0)
            {
                visible[visible.Count - 1].Window.SetOverflowCount(total);
            }
        }

        private void RaiseErpOpenRequested()
        {
            Action handler = ErpOpenRequested;
            if (handler != null)
            {
                handler();
            }
        }

        private void RaiseSettingsOpenRequested()
        {
            Action handler = SettingsOpenRequested;
            if (handler != null)
            {
                handler();
            }
        }

        private static int DismissAfterMilliseconds(
            NotificationPresentation presentation,
            string expiresAt)
        {
            if (!presentation.Realtime)
            {
                return presentation.AutoDismissMilliseconds;
            }
            DateTimeOffset parsed;
            if (!DateTimeOffset.TryParse(expiresAt, out parsed))
            {
                return presentation.AutoDismissMilliseconds;
            }
            double remaining = (parsed.ToUniversalTime() - DateTimeOffset.UtcNow)
                .TotalMilliseconds;
            if (remaining <= 1000)
            {
                return 1000;
            }
            return (int)Math.Min(
                presentation.AutoDismissMilliseconds,
                Math.Min(int.MaxValue, remaining));
        }
    }
}
