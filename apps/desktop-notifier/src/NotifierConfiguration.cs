using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;

namespace Lawand.DesktopNotifier
{
    internal sealed class NotifierConfiguration
    {
        private const int RecentDeliveryLimit = 100;

        public string GatewayBaseUrl { get; set; }
        public string ErpBaseUrl { get; set; }
        public string DeviceId { get; set; }
        public string DeviceName { get; set; }
        public string StaffDisplayName { get; set; }
        public bool HideContentWhenLocked { get; set; }
        public int AwayAfterMinutes { get; set; }
        public List<string> RecentlyDisplayedDeliveryIds { get; set; }

        [ScriptIgnore]
        public string SettingsPath
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Lawand",
                    "DesktopNotifier",
                    "settings.json");
            }
        }

        [ScriptIgnore]
        public string CredentialTarget
        {
            get
            {
                Uri gateway = new Uri(GatewayBaseUrl);
                string authority = gateway.Authority
                    .ToLowerInvariant()
                    .Replace(':', '_')
                    .Replace('[', '_')
                    .Replace(']', '_');
                return "Lawand/DesktopNotifier/v1/" + authority;
            }
        }

        public static NotifierConfiguration Load()
        {
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            NotifierConfiguration configuration = new NotifierConfiguration();
            configuration.GatewayBaseUrl = "https://api.lawandfirm.com";
            configuration.ErpBaseUrl = "https://erp.lawandfirm.com";
            configuration.DeviceName = Environment.MachineName;
            configuration.HideContentWhenLocked = true;
            configuration.AwayAfterMinutes = 10;
            configuration.RecentlyDisplayedDeliveryIds = new List<string>();

            string defaultsPath = Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "notifier.defaults.json");
            if (File.Exists(defaultsPath))
            {
                NotifierConfiguration defaults = serializer.Deserialize<NotifierConfiguration>(
                    File.ReadAllText(defaultsPath));
                if (defaults != null)
                {
                    if (!string.IsNullOrWhiteSpace(defaults.GatewayBaseUrl))
                    {
                        configuration.GatewayBaseUrl = defaults.GatewayBaseUrl;
                    }
                    if (!string.IsNullOrWhiteSpace(defaults.ErpBaseUrl))
                    {
                        configuration.ErpBaseUrl = defaults.ErpBaseUrl;
                    }
                }
            }

            string settingsPath = configuration.SettingsPath;
            if (File.Exists(settingsPath))
            {
                NotifierConfiguration stored = serializer.Deserialize<NotifierConfiguration>(
                    File.ReadAllText(settingsPath));
                if (stored != null)
                {
                    configuration = stored;
                }
            }

            configuration.GatewayBaseUrl = UrlSafety.NormalizeBaseUrl(
                configuration.GatewayBaseUrl,
                "Gateway 주소");
            configuration.ErpBaseUrl = UrlSafety.NormalizeBaseUrl(
                configuration.ErpBaseUrl,
                "ERP 주소");
            if (string.IsNullOrWhiteSpace(configuration.DeviceName))
            {
                configuration.DeviceName = Environment.MachineName;
            }
            if (configuration.RecentlyDisplayedDeliveryIds == null)
            {
                configuration.RecentlyDisplayedDeliveryIds = new List<string>();
            }
            if (configuration.AwayAfterMinutes < 1 ||
                configuration.AwayAfterMinutes > 120)
            {
                configuration.AwayAfterMinutes = 10;
            }
            configuration.RecentlyDisplayedDeliveryIds = configuration
                .RecentlyDisplayedDeliveryIds
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.Ordinal)
                .Take(RecentDeliveryLimit)
                .ToList();
            return configuration;
        }

        public void Save()
        {
            GatewayBaseUrl = UrlSafety.NormalizeBaseUrl(GatewayBaseUrl, "Gateway 주소");
            ErpBaseUrl = UrlSafety.NormalizeBaseUrl(ErpBaseUrl, "ERP 주소");
            string path = SettingsPath;
            string directory = Path.GetDirectoryName(path);
            Directory.CreateDirectory(directory);
            string temporaryPath = path + ".tmp";
            string json = new JavaScriptSerializer().Serialize(this);
            File.WriteAllText(temporaryPath, json);
            if (File.Exists(path))
            {
                File.Replace(temporaryPath, path, null);
            }
            else
            {
                File.Move(temporaryPath, path);
            }
        }

        public void RememberDelivery(string deliveryId)
        {
            if (string.IsNullOrWhiteSpace(deliveryId))
            {
                return;
            }
            RecentlyDisplayedDeliveryIds.Remove(deliveryId);
            RecentlyDisplayedDeliveryIds.Insert(0, deliveryId);
            if (RecentlyDisplayedDeliveryIds.Count > RecentDeliveryLimit)
            {
                RecentlyDisplayedDeliveryIds.RemoveRange(
                    RecentDeliveryLimit,
                    RecentlyDisplayedDeliveryIds.Count - RecentDeliveryLimit);
            }
            Save();
        }

        public void ClearDevice()
        {
            DeviceId = null;
            StaffDisplayName = null;
            RecentlyDisplayedDeliveryIds.Clear();
            Save();
        }
    }
}
