using System;
using System.Globalization;
using System.IO;
using System.Text;

namespace Lawand.CentrexBridge
{
    internal sealed class SafeLogger : IDisposable
    {
        private readonly object _sync = new object();
        private readonly string _directory;
        private readonly int _retentionDays;

        public SafeLogger(string dataDirectory, int retentionDays)
        {
            if (string.IsNullOrWhiteSpace(dataDirectory))
            {
                throw new ArgumentException("브리지 데이터 경로가 필요합니다.", "dataDirectory");
            }
            _directory = Path.Combine(
                Path.GetFullPath(dataDirectory),
                "logs");
            _retentionDays = retentionDays;
            Directory.CreateDirectory(_directory);
            DeleteExpiredLogs();
        }

        public event EventHandler<SafeLogEventArgs> EntryWritten;

        public void Info(string eventName, params string[] fields)
        {
            Write("INFO", eventName, fields);
        }

        public void Warn(string eventName, params string[] fields)
        {
            Write("WARN", eventName, fields);
        }

        public void Error(string eventName, Exception exception)
        {
            string errorType = exception == null
                ? "Unknown"
                : CentrexEventParser.SafeToken(exception.GetType().Name, 80);
            Write("ERROR", eventName, new[]
            {
                "TYPE=" + errorType,
                "CHAIN=" + ExceptionTypeChain(exception)
            });
        }

        private static string ExceptionTypeChain(Exception exception)
        {
            StringBuilder result = new StringBuilder();
            Exception current = exception;
            int depth = 0;
            while (current != null && depth < 5)
            {
                if (result.Length > 0)
                {
                    result.Append('.');
                }
                result.Append(CentrexEventParser.SafeToken(current.GetType().Name, 48));
                current = current.InnerException;
                depth++;
            }
            return result.Length == 0 ? "Unknown" : result.ToString();
        }

        private void Write(string level, string eventName, string[] fields)
        {
            StringBuilder line = new StringBuilder();
            line.Append(DateTimeOffset.Now.ToString("o", CultureInfo.InvariantCulture));
            line.Append('|').Append(CentrexEventParser.SafeToken(level, 12));
            line.Append('|').Append(CentrexEventParser.SafeToken(eventName, 80));

            if (fields != null)
            {
                for (int index = 0; index < fields.Length; index++)
                {
                    line.Append('|').Append(SanitizeField(fields[index]));
                }
            }

            string text = line.ToString();
            string path = Path.Combine(
                _directory,
                "bridge-" + DateTime.Now.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + ".log");

            lock (_sync)
            {
                File.AppendAllText(path, text + Environment.NewLine, new UTF8Encoding(false));
            }

            EventHandler<SafeLogEventArgs> handler = EntryWritten;
            if (handler != null)
            {
                handler(this, new SafeLogEventArgs(text));
            }
        }

        private static string SanitizeField(string value)
        {
            string source = value ?? string.Empty;
            StringBuilder result = new StringBuilder();
            for (int index = 0; index < source.Length && result.Length < 160; index++)
            {
                char character = source[index];
                if ((character >= 'a' && character <= 'z') ||
                    (character >= 'A' && character <= 'Z') ||
                    (character >= '0' && character <= '9') ||
                    character == '_' || character == '-' || character == '.' || character == '=' ||
                    character == ':' || character == '*')
                {
                    result.Append(character);
                }
            }

            return result.ToString();
        }

        private void DeleteExpiredLogs()
        {
            DateTime threshold = DateTime.UtcNow.Date.AddDays(-_retentionDays);
            foreach (string path in Directory.GetFiles(_directory, "bridge-*.log"))
            {
                try
                {
                    if (File.GetLastWriteTimeUtc(path) < threshold)
                    {
                        File.Delete(path);
                    }
                }
                catch (IOException)
                {
                }
                catch (UnauthorizedAccessException)
                {
                }
            }
        }

        public void Dispose()
        {
        }
    }

    internal sealed class SafeLogEventArgs : EventArgs
    {
        public SafeLogEventArgs(string line)
        {
            Line = line;
        }

        public string Line { get; private set; }
    }
}
