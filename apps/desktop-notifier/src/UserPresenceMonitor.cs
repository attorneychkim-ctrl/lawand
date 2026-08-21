using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Lawand.DesktopNotifier
{
    internal sealed class UserPresenceMonitor : IDisposable
    {
        private readonly Timer timer;
        private readonly TimeSpan awayThreshold;
        private bool sessionLocked;
        private bool away;
        private bool disposed;

        public UserPresenceMonitor(TimeSpan awayThreshold)
        {
            if (awayThreshold < TimeSpan.FromMinutes(1))
            {
                throw new ArgumentOutOfRangeException("awayThreshold");
            }
            this.awayThreshold = awayThreshold;
            timer = new Timer();
            timer.Interval = 5000;
            timer.Tick += delegate { Refresh(); };
        }

        public event Action<bool> AwayChanged;

        public bool IsAway
        {
            get { return away; }
        }

        public void Start()
        {
            if (disposed)
            {
                return;
            }
            Refresh();
            timer.Start();
        }

        public void SetSessionLocked(bool value)
        {
            if (disposed)
            {
                return;
            }
            sessionLocked = value;
            Refresh();
        }

        public void Refresh()
        {
            if (disposed)
            {
                return;
            }
            bool next = sessionLocked || UserInputIdleTime.Read() >= awayThreshold;
            if (next == away)
            {
                return;
            }
            away = next;
            Action<bool> handler = AwayChanged;
            if (handler != null)
            {
                handler(away);
            }
        }

        public void Dispose()
        {
            if (disposed)
            {
                return;
            }
            disposed = true;
            timer.Stop();
            timer.Dispose();
        }
    }

    internal static class UserInputIdleTime
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct LastInputInfo
        {
            public uint Size;
            public uint Time;
        }

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetLastInputInfo(ref LastInputInfo inputInfo);

        public static TimeSpan Read()
        {
            LastInputInfo info = new LastInputInfo();
            info.Size = checked((uint)Marshal.SizeOf(typeof(LastInputInfo)));
            if (!GetLastInputInfo(ref info))
            {
                return TimeSpan.Zero;
            }
            uint current = unchecked((uint)Environment.TickCount);
            uint elapsed = unchecked(current - info.Time);
            return TimeSpan.FromMilliseconds(elapsed);
        }
    }
}
