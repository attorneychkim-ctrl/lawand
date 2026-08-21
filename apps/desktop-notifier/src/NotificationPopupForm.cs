using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Lawand.DesktopNotifier
{
    internal sealed class NotificationPopupForm : Form
    {
        private const int TimerIntervalMilliseconds = 250;
        private readonly NotificationPresentation presentation;
        private readonly IList<NotificationBodyItem> items;
        private readonly Timer dismissTimer;
        private readonly string titleText;
        private readonly string statusText;
        private readonly string actionText;
        private int remainingMilliseconds;
        private int overflowCount;
        private bool mouseInside;
        private Rectangle closeBounds;
        private Rectangle actionBounds;

        public NotificationPopupForm(
            NotificationPresentation presentation,
            string title,
            string body,
            string status,
            string action,
            int dismissAfterMilliseconds)
        {
            if (presentation == null)
            {
                throw new ArgumentNullException("presentation");
            }

            this.presentation = presentation;
            items = NotificationBodyFormatter.Build(presentation.Kind, body);
            titleText = Normalize(title, "새 업무 알림");
            statusText = Normalize(
                status,
                presentation.Realtime
                    ? "실시간 · 최대 2분 유지"
                    : dismissAfterMilliseconds > 0
                        ? "잠시 후 자동으로 닫힘"
                        : "확인할 때까지 유지");
            actionText = Normalize(action, presentation.OpenActionText);
            remainingMilliseconds = Math.Max(0, dismissAfterMilliseconds);

            AutoScaleMode = AutoScaleMode.None;
            BackColor = Color.FromArgb(244, 247, 252);
            ClientSize = presentation.PopupSize;
            FormBorderStyle = FormBorderStyle.None;
            MaximizeBox = false;
            MinimizeBox = false;
            Name = "LawandNotificationPopup";
            ShowIcon = false;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Text = "LAW& OS " + presentation.Label + " 알림";
            TopMost = true;
            AccessibleName = Text;
            AccessibleRole = AccessibleRole.Alert;
            SetStyle(
                ControlStyles.AllPaintingInWmPaint |
                ControlStyles.OptimizedDoubleBuffer |
                ControlStyles.ResizeRedraw |
                ControlStyles.UserPaint,
                true);

            dismissTimer = new Timer();
            dismissTimer.Interval = TimerIntervalMilliseconds;
            dismissTimer.Tick += DismissTimerTick;
        }

        public event Action OpenRequested;
        public event Action<NotificationPopupForm> PopupClosed;

        protected override bool ShowWithoutActivation
        {
            get { return true; }
        }

        protected override CreateParams CreateParams
        {
            get
            {
                const int CsDropShadow = 0x00020000;
                const int WsExToolWindow = 0x00000080;
                CreateParams parameters = base.CreateParams;
                parameters.ClassStyle |= CsDropShadow;
                parameters.ExStyle |= WsExToolWindow;
                return parameters;
            }
        }

        public void SetOverflowCount(int count)
        {
            overflowCount = Math.Max(0, count);
            Invalidate();
        }

        protected override void OnShown(EventArgs eventArgs)
        {
            base.OnShown(eventArgs);
            ApplyRoundedRegion();
            if (remainingMilliseconds > 0)
            {
                dismissTimer.Start();
            }
        }

        protected override void OnSizeChanged(EventArgs eventArgs)
        {
            base.OnSizeChanged(eventArgs);
            if (IsHandleCreated)
            {
                ApplyRoundedRegion();
            }
        }

        protected override void OnPaint(PaintEventArgs eventArgs)
        {
            base.OnPaint(eventArgs);
            Graphics graphics = eventArgs.Graphics;
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

            Rectangle surface = new Rectangle(
                1,
                1,
                Math.Max(1, ClientSize.Width - 3),
                Math.Max(1, ClientSize.Height - 3));
            using (GraphicsPath surfacePath = RoundedPath(surface, 27))
            using (LinearGradientBrush background = new LinearGradientBrush(
                surface,
                Color.FromArgb(252, 254, 255),
                Blend(Color.FromArgb(235, 240, 249), presentation.TintColor, 0.34F),
                35F))
            using (Pen border = new Pen(Color.FromArgb(225, 255, 255, 255), 1F))
            {
                graphics.FillPath(background, surfacePath);
                DrawAtmosphere(graphics, surfacePath);
                graphics.DrawPath(border, surfacePath);
            }

            DrawHeader(graphics);
            DrawTitle(graphics);
            DrawContent(graphics);
            DrawFooter(graphics);
        }

        protected override void OnMouseEnter(EventArgs eventArgs)
        {
            mouseInside = true;
            base.OnMouseEnter(eventArgs);
        }

        protected override void OnMouseLeave(EventArgs eventArgs)
        {
            mouseInside = ClientRectangle.Contains(PointToClient(Cursor.Position));
            base.OnMouseLeave(eventArgs);
        }

        protected override void OnMouseMove(MouseEventArgs eventArgs)
        {
            Cursor = closeBounds.Contains(eventArgs.Location) ||
                actionBounds.Contains(eventArgs.Location)
                ? Cursors.Hand
                : Cursors.Default;
            base.OnMouseMove(eventArgs);
        }

        protected override void OnMouseUp(MouseEventArgs eventArgs)
        {
            if (eventArgs.Button == MouseButtons.Left)
            {
                if (closeBounds.Contains(eventArgs.Location))
                {
                    Close();
                    return;
                }
                if (actionBounds.Contains(eventArgs.Location))
                {
                    Action handler = OpenRequested;
                    if (handler != null)
                    {
                        handler();
                    }
                    Close();
                    return;
                }
            }
            base.OnMouseUp(eventArgs);
        }

        protected override void OnFormClosed(FormClosedEventArgs eventArgs)
        {
            dismissTimer.Stop();
            dismissTimer.Dispose();
            Action<NotificationPopupForm> handler = PopupClosed;
            if (handler != null)
            {
                handler(this);
            }
            base.OnFormClosed(eventArgs);
        }

        private void DrawAtmosphere(Graphics graphics, GraphicsPath clipPath)
        {
            GraphicsState state = graphics.Save();
            graphics.SetClip(clipPath);
            using (SolidBrush accentGlow = new SolidBrush(
                Color.FromArgb(38, presentation.AccentColor)))
            using (SolidBrush whiteGlow = new SolidBrush(
                Color.FromArgb(128, Color.White)))
            {
                graphics.FillEllipse(
                    accentGlow,
                    ClientSize.Width - 238,
                    -135,
                    330,
                    270);
                graphics.FillEllipse(
                    whiteGlow,
                    -140,
                    ClientSize.Height - 175,
                    330,
                    260);
            }
            graphics.Restore(state);
        }

        private void DrawHeader(Graphics graphics)
        {
            Rectangle orb = new Rectangle(24, 21, 46, 46);
            using (GraphicsPath orbPath = RoundedPath(orb, 23))
            using (LinearGradientBrush orbBrush = AccentBrush(orb))
            using (Pen orbBorder = new Pen(Color.FromArgb(210, Color.White)))
            {
                graphics.FillPath(orbBrush, orbPath);
                graphics.DrawPath(orbBorder, orbPath);
            }
            DrawText(
                graphics,
                presentation.Glyph,
                UiFont(15F, FontStyle.Bold),
                Color.White,
                orb,
                TextFormatFlags.HorizontalCenter |
                TextFormatFlags.VerticalCenter |
                TextFormatFlags.SingleLine);

            int labelWidth = MeasurePillWidth(graphics, presentation.Label, 54);
            DrawPill(
                graphics,
                new Rectangle(84, 21, labelWidth, 27),
                presentation.Label,
                Blend(Color.White, presentation.TintColor, 0.68F),
                Color.FromArgb(68, presentation.AccentColor),
                presentation.AccentColor,
                11F);
            string attention = presentation.Realtime
                ? "●  LIVE · 지금 확인"
                : "NEW · 내 업무";
            int attentionWidth = MeasurePillWidth(graphics, attention, 96);
            DrawPill(
                graphics,
                new Rectangle(91 + labelWidth, 21, attentionWidth, 27),
                attention,
                presentation.Realtime
                    ? Color.FromArgb(255, 236, 240)
                    : Color.FromArgb(205, 255, 255, 255),
                presentation.Realtime
                    ? Color.FromArgb(80, 244, 63, 94)
                    : Color.FromArgb(76, 148, 163, 184),
                presentation.Realtime
                    ? Color.FromArgb(225, 29, 72)
                    : Color.FromArgb(71, 85, 105),
                10.5F);
            DrawText(
                graphics,
                "LAW& OS  ·  개인 PC 알림",
                UiFont(10.5F, FontStyle.Regular),
                Color.FromArgb(100, 116, 139),
                new Rectangle(86, 50, ClientSize.Width - 145, 18),
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter |
                TextFormatFlags.SingleLine);

            closeBounds = new Rectangle(ClientSize.Width - 57, 20, 35, 35);
            using (GraphicsPath closePath = RoundedPath(closeBounds, 18))
            using (SolidBrush closeBrush = new SolidBrush(
                Color.FromArgb(205, 255, 255, 255)))
            using (Pen closeBorder = new Pen(Color.FromArgb(72, 148, 163, 184)))
            {
                graphics.FillPath(closeBrush, closePath);
                graphics.DrawPath(closeBorder, closePath);
            }
            DrawText(
                graphics,
                "×",
                UiFont(16F, FontStyle.Regular),
                Color.FromArgb(71, 85, 105),
                closeBounds,
                TextFormatFlags.HorizontalCenter |
                TextFormatFlags.VerticalCenter |
                TextFormatFlags.SingleLine);
        }

        private void DrawTitle(Graphics graphics)
        {
            DrawText(
                graphics,
                titleText,
                UiFont(18F, FontStyle.Bold),
                Color.FromArgb(15, 23, 42),
                new Rectangle(25, 77, ClientSize.Width - 50, 43),
                TextFormatFlags.Left |
                TextFormatFlags.VerticalCenter |
                TextFormatFlags.WordBreak |
                TextFormatFlags.EndEllipsis);
        }

        private void DrawContent(Graphics graphics)
        {
            Rectangle content = new Rectangle(
                24,
                126,
                ClientSize.Width - 48,
                Math.Max(50, ClientSize.Height - 199));
            NotificationBodyItem detail = items
                .FirstOrDefault(IsPreferredDetailItem) ??
                items.FirstOrDefault(IsLongItem);
            List<NotificationBodyItem> facts = items
                .Where(item => !object.ReferenceEquals(item, detail))
                .ToList();
            if (detail == null && facts.Count == 1)
            {
                detail = facts[0];
                facts.Clear();
            }

            int detailHeight = detail == null
                ? 0
                : Math.Min(88, Math.Max(82, content.Height / 2));
            int detailGap = detail == null || facts.Count == 0 ? 0 : 8;
            int factsHeight = content.Height - detailHeight - detailGap;
            if (facts.Count > 0)
            {
                DrawFactGrid(
                    graphics,
                    facts,
                    new Rectangle(content.X, content.Y, content.Width, factsHeight));
            }
            if (detail != null)
            {
                DrawDetailCard(
                    graphics,
                    detail,
                    new Rectangle(
                        content.X,
                        content.Bottom - detailHeight,
                        content.Width,
                        detailHeight));
            }
        }

        private void DrawFactGrid(
            Graphics graphics,
            IList<NotificationBodyItem> facts,
            Rectangle bounds)
        {
            int columns = facts.Count > 1 ? 2 : 1;
            int rows = Math.Max(1, (int)Math.Ceiling(facts.Count / (double)columns));
            const int gap = 8;
            int cellWidth = (bounds.Width - ((columns - 1) * gap)) / columns;
            int cellHeight = (bounds.Height - ((rows - 1) * gap)) / rows;
            int commonBadgeWidth = facts
                .Select(item => MeasurePillWidth(graphics, item.Label, 64))
                .Max();
            commonBadgeWidth = Math.Min(
                commonBadgeWidth,
                Math.Max(64, cellWidth - 92));
            for (int index = 0; index < facts.Count; index++)
            {
                int row = index / columns;
                int column = index % columns;
                bool spansFullRow = columns == 2 &&
                    index == facts.Count - 1 &&
                    facts.Count % 2 == 1;
                Rectangle card = new Rectangle(
                    spansFullRow
                        ? bounds.X
                        : bounds.X + (column * (cellWidth + gap)),
                    bounds.Y + (row * (cellHeight + gap)),
                    spansFullRow
                        ? bounds.Width
                        : column == columns - 1 ? bounds.Right -
                            (bounds.X + (column * (cellWidth + gap))) : cellWidth,
                    row == rows - 1 ? bounds.Bottom -
                        (bounds.Y + (row * (cellHeight + gap))) : cellHeight);
                DrawFactCard(graphics, facts[index], card, commonBadgeWidth);
            }
        }

        private void DrawFactCard(
            Graphics graphics,
            NotificationBodyItem item,
            Rectangle bounds,
            int badgeWidth)
        {
            bool primary = IsPrimaryItem(item);
            Color cardFill = primary
                ? Blend(Color.White, presentation.TintColor, 0.34F)
                : Color.FromArgb(225, 255, 255, 255);
            using (GraphicsPath path = RoundedPath(bounds, 14))
            using (SolidBrush fill = new SolidBrush(cardFill))
            using (Pen border = new Pen(
                primary
                    ? Color.FromArgb(60, presentation.AccentColor)
                    : Color.FromArgb(115, 255, 255, 255)))
            {
                graphics.FillPath(fill, path);
                graphics.DrawPath(border, path);
            }

            Rectangle badge = new Rectangle(
                bounds.X + 10,
                bounds.Y + ((bounds.Height - 21) / 2),
                badgeWidth,
                21);
            DrawPill(
                graphics,
                badge,
                item.Label,
                Blend(Color.White, presentation.TintColor, 0.78F),
                Color.FromArgb(54, presentation.AccentColor),
                presentation.AccentColor,
                9.5F);

            Rectangle valueBounds = new Rectangle(
                badge.Right + 10,
                bounds.Y + 5,
                Math.Max(12, bounds.Right - badge.Right - 20),
                Math.Max(12, bounds.Height - 10));
            DrawText(
                graphics,
                item.Value,
                UiFont(primary ? 13.5F : 12.5F, primary
                    ? FontStyle.Bold
                    : FontStyle.Regular),
                primary
                    ? Color.FromArgb(22, 42, 76)
                    : Color.FromArgb(30, 41, 59),
                valueBounds,
                TextFormatFlags.Left |
                TextFormatFlags.VerticalCenter |
                TextFormatFlags.SingleLine |
                TextFormatFlags.EndEllipsis);
        }

        private void DrawDetailCard(
            Graphics graphics,
            NotificationBodyItem item,
            Rectangle bounds)
        {
            int badgeWidth = Math.Min(
                bounds.Width - 28,
                MeasurePillWidth(graphics, item.Label, 70));
            DrawPill(
                graphics,
                new Rectangle(bounds.X, bounds.Y, badgeWidth, 20),
                item.Label,
                presentation.TintColor,
                Color.FromArgb(62, presentation.AccentColor),
                presentation.AccentColor,
                9.5F);

            Rectangle fieldBounds = new Rectangle(
                bounds.X,
                bounds.Y + 26,
                bounds.Width,
                Math.Max(28, bounds.Height - 26));
            using (GraphicsPath path = RoundedPath(fieldBounds, 16))
            using (LinearGradientBrush fill = new LinearGradientBrush(
                fieldBounds,
                Blend(Color.White, presentation.TintColor, 0.42F),
                Color.FromArgb(235, 255, 255, 255),
                0F))
            using (Pen border = new Pen(Color.FromArgb(58, presentation.AccentColor)))
            {
                graphics.FillPath(fill, path);
                graphics.DrawPath(border, path);
            }
            Rectangle rail = new Rectangle(
                fieldBounds.X + 1,
                fieldBounds.Y + 10,
                4,
                Math.Max(12, fieldBounds.Height - 20));
            using (GraphicsPath railPath = RoundedPath(rail, 2))
            using (SolidBrush railFill = new SolidBrush(presentation.AccentColor))
            {
                graphics.FillPath(railFill, railPath);
            }
            DrawText(
                graphics,
                item.Value,
                UiFont(12.5F, FontStyle.Regular),
                Color.FromArgb(30, 41, 59),
                new Rectangle(
                    fieldBounds.X + 15,
                    fieldBounds.Y + 8,
                    fieldBounds.Width - 30,
                    Math.Max(18, fieldBounds.Height - 16)),
                TextFormatFlags.Left |
                TextFormatFlags.Top |
                TextFormatFlags.WordBreak |
                TextFormatFlags.EndEllipsis);
        }

        private void DrawFooter(Graphics graphics)
        {
            int ruleY = ClientSize.Height - 64;
            using (Pen rule = new Pen(Color.FromArgb(78, 148, 163, 184)))
            {
                graphics.DrawLine(rule, 25, ruleY, ClientSize.Width - 25, ruleY);
            }
            using (SolidBrush dot = new SolidBrush(presentation.AccentColor))
            {
                graphics.FillEllipse(dot, 27, ruleY + 27, 7, 7);
            }
            int overflowWidth = overflowCount > 0 ? 64 : 0;
            int buttonWidth = Math.Min(174, Math.Max(142, actionText.Length * 14 + 42));
            actionBounds = new Rectangle(
                ClientSize.Width - 24 - buttonWidth,
                ruleY + 10,
                buttonWidth,
                43);
            DrawText(
                graphics,
                statusText,
                UiFont(10.5F, FontStyle.Regular),
                Color.FromArgb(100, 116, 139),
                new Rectangle(
                    42,
                    ruleY + 14,
                    Math.Max(30, actionBounds.X - 55 - overflowWidth),
                    33),
                TextFormatFlags.Left |
                TextFormatFlags.VerticalCenter |
                TextFormatFlags.SingleLine |
                TextFormatFlags.EndEllipsis);

            if (overflowCount > 0)
            {
                Rectangle overflow = new Rectangle(
                    actionBounds.X - 72,
                    ruleY + 17,
                    62,
                    28);
                DrawPill(
                    graphics,
                    overflow,
                    "외 " + overflowCount + "건",
                    Color.FromArgb(220, Color.White),
                    Color.FromArgb(62, presentation.AccentColor),
                    presentation.AccentColor,
                    10F);
            }

            using (GraphicsPath buttonPath = RoundedPath(actionBounds, 22))
            using (LinearGradientBrush buttonFill = AccentBrush(actionBounds))
            using (Pen buttonBorder = new Pen(Color.FromArgb(120, Color.White)))
            {
                graphics.FillPath(buttonFill, buttonPath);
                graphics.DrawPath(buttonBorder, buttonPath);
            }
            DrawText(
                graphics,
                actionText + "   →",
                UiFont(11.5F, FontStyle.Bold),
                Color.White,
                actionBounds,
                TextFormatFlags.HorizontalCenter |
                TextFormatFlags.VerticalCenter |
                TextFormatFlags.SingleLine);
        }

        private void DismissTimerTick(object sender, EventArgs eventArgs)
        {
            if (presentation.PauseOnHover && mouseInside)
            {
                return;
            }
            remainingMilliseconds -= TimerIntervalMilliseconds;
            if (remainingMilliseconds <= 0)
            {
                dismissTimer.Stop();
                Close();
            }
        }

        private void ApplyRoundedRegion()
        {
            IntPtr regionHandle = CreateRoundRectRgn(
                0,
                0,
                ClientSize.Width + 1,
                ClientSize.Height + 1,
                28,
                28);
            try
            {
                Region = Region.FromHrgn(regionHandle);
            }
            finally
            {
                DeleteObject(regionHandle);
            }
        }

        private LinearGradientBrush AccentBrush(Rectangle bounds)
        {
            Color end = Color.FromArgb(
                Math.Max(0, presentation.AccentColor.R - 28),
                Math.Max(0, presentation.AccentColor.G - 28),
                Math.Max(0, presentation.AccentColor.B - 28));
            return new LinearGradientBrush(
                bounds,
                presentation.AccentColor,
                end,
                35F);
        }

        private static bool IsLongItem(NotificationBodyItem item)
        {
            string label = item == null ? string.Empty : item.Label ?? string.Empty;
            string value = item == null ? string.Empty : item.Value ?? string.Empty;
            return label.Contains("내용") || label.Contains("본문") ||
                label.Contains("메모") || value.Length > 72;
        }

        private static bool IsPreferredDetailItem(NotificationBodyItem item)
        {
            string label = item == null ? string.Empty : item.Label ?? string.Empty;
            return string.Equals(label, "상담 내용", StringComparison.Ordinal) ||
                string.Equals(label, "문자 내용", StringComparison.Ordinal) ||
                string.Equals(label, "후기 내용", StringComparison.Ordinal) ||
                string.Equals(label, "테스트 내용", StringComparison.Ordinal) ||
                label.Contains("본문");
        }

        private static bool IsPrimaryItem(NotificationBodyItem item)
        {
            string label = item == null ? string.Empty : item.Label ?? string.Empty;
            return label.Contains("고객명") || label.Contains("전화번호") ||
                label.Contains("연락처") || label.Contains("발신 직원") ||
                label.Contains("발신 내선");
        }

        private static void DrawPill(
            Graphics graphics,
            Rectangle bounds,
            string text,
            Color fill,
            Color border,
            Color foreground,
            float fontSize)
        {
            using (GraphicsPath path = RoundedPath(bounds, bounds.Height / 2))
            using (SolidBrush brush = new SolidBrush(fill))
            using (Pen pen = new Pen(border))
            {
                graphics.FillPath(brush, path);
                graphics.DrawPath(pen, path);
            }
            DrawText(
                graphics,
                text,
                UiFont(fontSize, FontStyle.Bold),
                foreground,
                bounds,
                TextFormatFlags.HorizontalCenter |
                TextFormatFlags.VerticalCenter |
                TextFormatFlags.SingleLine |
                TextFormatFlags.EndEllipsis);
        }

        private static int MeasurePillWidth(
            Graphics graphics,
            string text,
            int minimum)
        {
            Size measured = TextRenderer.MeasureText(
                graphics,
                text ?? string.Empty,
                UiFont(10.5F, FontStyle.Bold),
                Size.Empty,
                TextFormatFlags.NoPadding | TextFormatFlags.SingleLine);
            return Math.Max(minimum, measured.Width + 24);
        }

        private static void DrawText(
            Graphics graphics,
            string text,
            Font font,
            Color color,
            Rectangle bounds,
            TextFormatFlags flags)
        {
            using (font)
            {
                TextRenderer.DrawText(
                    graphics,
                    text ?? string.Empty,
                    font,
                    bounds,
                    color,
                    flags | TextFormatFlags.NoPadding | TextFormatFlags.PreserveGraphicsClipping);
            }
        }

        private static Font UiFont(float size, FontStyle style)
        {
            return new Font("Segoe UI", size, style, GraphicsUnit.Pixel);
        }

        private static GraphicsPath RoundedPath(Rectangle bounds, int radius)
        {
            int diameter = Math.Max(2, Math.Min(
                Math.Min(bounds.Width, bounds.Height),
                radius * 2));
            Rectangle arc = new Rectangle(bounds.Location, new Size(diameter, diameter));
            GraphicsPath path = new GraphicsPath();
            path.AddArc(arc, 180, 90);
            arc.X = bounds.Right - diameter;
            path.AddArc(arc, 270, 90);
            arc.Y = bounds.Bottom - diameter;
            path.AddArc(arc, 0, 90);
            arc.X = bounds.Left;
            path.AddArc(arc, 90, 90);
            path.CloseFigure();
            return path;
        }

        private static Color Blend(Color first, Color second, float secondWeight)
        {
            float weight = Math.Max(0F, Math.Min(1F, secondWeight));
            return Color.FromArgb(
                (int)Math.Round((first.R * (1F - weight)) + (second.R * weight)),
                (int)Math.Round((first.G * (1F - weight)) + (second.G * weight)),
                (int)Math.Round((first.B * (1F - weight)) + (second.B * weight)));
        }

        private static string Normalize(string value, string fallback)
        {
            string normalized = (value ?? string.Empty).Trim();
            return normalized.Length > 0 ? normalized : fallback;
        }

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr objectHandle);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateRoundRectRgn(
            int left,
            int top,
            int right,
            int bottom,
            int ellipseWidth,
            int ellipseHeight);
    }
}
