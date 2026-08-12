using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Lawand.CentrexBridge
{
    internal static class BridgeSelfTests
    {
        private static int _failed;

        private static int Main()
        {
            Run("수신 이벤트 파싱", ParseInboundRing);
            Run("값 내부 콜론 보존", PreserveValueColon);
            Run("전화번호 마스킹", MaskPhone);
            Run("통화 상대 종류 분류", CallPartyKind);
            Run("호전환 채널 종류 분류", ChannelKind);
            Run("내선 suffix 비교", ExtensionSuffix);
            Run("로그 토큰 정제", SafeToken);
            Run("센트릭스 연관 leg 판정", RelatedUniqueId);
            Run("연결 채널 종료 leg 판정", RelatedConnectedChannelUniqueId);
            Run("gateway 최소 이벤트 JSON", GatewayEventJson);
            Run("gateway 발신 이벤트 JSON", GatewayOutboundEventJson);
            Run("gateway 통화 관측 v2 JSON", GatewayCallObservationJson);
            Run("gateway 영구 거절 격리 정책", GatewayPermanentFailureDisposition);
            Run("gateway 프로비저닝 암호문 호환", ProvisioningEnvelopeCompatibility);
            Run("회선 교체 중 network error 지연", ProvisioningNetworkErrorDeferred);
            Run("OpenAPI 내선 로그인 fallback 제한", ProvisioningExtensionLoginFallback);
            Run("다중 인스턴스 데이터 경로 격리", MultiInstanceDataDirectory);
            Run("격리 슬롯 유휴 초기화 설정", ResetPoolSlotConfiguration);
            Run("미연결 통화 관측 만료", CallObservationExpiry);
            Run("v2 통화 관측 수명주기", CallObservationTracking);

            Console.WriteLine(_failed == 0
                ? "Centrex bridge self-tests passed."
                : "Centrex bridge self-tests failed: " + _failed);
            return _failed == 0 ? 0 : 1;
        }

        private static void ParseInboundRing()
        {
            ParsedCentrexEvent parsed = CentrexEventParser.Parse(
                "RINGEVENT|ISDIAL:0|INEXTEN:07000001234|AGENT:10004591|" +
                "CALLERID:01012345678|UNIQUEID:1315457785.80");
            Equal("RINGEVENT", parsed.EventName);
            Equal("0", parsed.Get("ISDIAL"));
            Equal("07000001234", parsed.Get("INEXTEN"));
            Equal("01012345678", parsed.Get("CALLERID"));
            Equal("1315457785.80", parsed.Get("UNIQUEID"));
        }

        private static void PreserveValueColon()
        {
            ParsedCentrexEvent parsed = CentrexEventParser.Parse(
                "CMDRESULT|CMD:TEST|RES:value:with:colon");
            Equal("value:with:colon", parsed.Get("RES"));
        }

        private static void MaskPhone()
        {
            Equal("***5678", CentrexEventParser.MaskPhone("010-1234-5678"));
            Equal("unknown", CentrexEventParser.MaskPhone(""));
        }

        private static void CallPartyKind()
        {
            Equal("internal", CentrexEventParser.CallPartyKind("3322"));
            Equal("internal", CentrexEventParser.CallPartyKind("10004591"));
            Equal("external", CentrexEventParser.CallPartyKind("01012345678"));
            Equal("unknown", CentrexEventParser.CallPartyKind("null"));
        }

        private static void ChannelKind()
        {
            Equal(
                "local_xfer",
                CentrexEventParser.ChannelKind("Local/3458@xfercontext-000001;2"));
            Equal("local", CentrexEventParser.ChannelKind("Local/3458@test-000001;1"));
            Equal("sip", CentrexEventParser.ChannelKind("SIP/10013458-c7fb"));
            Equal("pjsip", CentrexEventParser.ChannelKind("PJSIP/10013458-0001"));
            Equal("none", CentrexEventParser.ChannelKind("null"));
            Equal("other", CentrexEventParser.ChannelKind("IAX2/provider-1"));
        }

        private static void ExtensionSuffix()
        {
            True(CentrexEventParser.EndsWithDigits("10004591", "4591"));
            True(!CentrexEventParser.EndsWithDigits("10004592", "4591"));
        }

        private static void SafeToken()
        {
            Equal("RING_EVENTbad", CentrexEventParser.SafeToken("RING_EVENT|bad", 80));
            Equal("abcdefgh", CentrexEventParser.SafeToken("abcdefghijk", 8));
        }

        private static void RelatedUniqueId()
        {
            True(CentrexEventParser.IsRelatedUniqueId(
                "1785978915.2562954",
                "1785978915.2562955"));
            True(CentrexEventParser.IsRelatedUniqueId(
                "1785978915.2562954",
                "1785978915.2562954"));
            True(!CentrexEventParser.IsRelatedUniqueId(
                "1785978915.2562954",
                "1785978915.2562957"));
            True(!CentrexEventParser.IsRelatedUniqueId(
                "1785978915.2562954",
                "1785978916.2562955"));
        }

        private static void RelatedConnectedChannelUniqueId()
        {
            HashSet<string> activeUniqueIds = new HashSet<string>(StringComparer.Ordinal)
            {
                "1785992765.2605311",
                "1785992778.2605358"
            };
            True(CentrexEventParser.IsRelatedUniqueId(
                activeUniqueIds,
                "1785992778.2605358"));
            True(!CentrexEventParser.IsRelatedUniqueId(
                activeUniqueIds,
                "1785992778.2605368"));
        }

        private static void GatewayEventJson()
        {
            BridgeConfiguration configuration = new BridgeConfiguration
            {
                BridgeId = "seoul-phone-01",
                EndpointId = "01980000-0000-7000-8000-000000000002"
            };
            GatewayEventPayload payload = GatewayEventPayload.Ringing(
                configuration,
                "1315457785.80",
                "01012345678",
                "07000001234");
            string json = payload.ToJson();
            True(json.Contains("\"eventType\":\"inbound.ringing\""));
            True(json.Contains("\"callerNumber\":\"01012345678\""));
            True(!json.Contains("RINGEVENT"));
            string endedJson = GatewayEventPayload.Ended(
                configuration,
                "1315457785.80",
                "BRIDGE_RECONNECT").ToJson();
            True(endedJson.Contains("\"eventType\":\"inbound.ended\""));
            True(endedJson.Contains("\"providerEndCause\":\"BRIDGE_RECONNECT\""));
        }

        private static void GatewayOutboundEventJson()
        {
            BridgeConfiguration configuration = new BridgeConfiguration
            {
                BridgeId = "seoul-phone-01",
                EndpointId = "01980000-0000-7000-8000-000000000002"
            };
            GatewayEventPayload payload = GatewayEventPayload.OutboundRinging(
                configuration,
                "1785994319.2611306",
                "01012341382");
            string json = payload.ToJson();
            True(json.Contains("\"eventType\":\"outbound.ringing\""));
            True(json.Contains("\"calledNumber\":\"01012341382\""));
            True(!json.Contains("callerNumber"));
            True(!json.Contains("RINGEVENT"));
            string endedJson = GatewayEventPayload.OutboundEnded(
                configuration,
                "1785994319.2611306",
                "BRIDGE_RECONNECT").ToJson();
            True(endedJson.Contains("\"eventType\":\"outbound.ended\""));
            True(endedJson.Contains("\"providerEndCause\":\"BRIDGE_RECONNECT\""));

            bool rejectedInternalExtension = false;
            try
            {
                GatewayEventPayload.OutboundRinging(
                    configuration,
                    "1785994319.2611307",
                    "8307");
            }
            catch (ArgumentException)
            {
                rejectedInternalExtension = true;
            }
            True(rejectedInternalExtension);
        }

        private static void GatewayCallObservationJson()
        {
            BridgeConfiguration configuration = new BridgeConfiguration
            {
                BridgeId = "seoul-phone-01",
                EndpointId = "01980000-0000-7000-8000-000000000002",
                ExpectedExtension = "4591"
            };
            string ringing = GatewayEventPayload.ObservedRinging(
                configuration,
                "1785994319.3000001",
                "outbound",
                "internal",
                "1208",
                string.Empty,
                "1785994319.2999991",
                "sip",
                "sip").ToJson();
            True(ringing.Contains("\"schemaVersion\":2"));
            True(ringing.Contains("\"eventType\":\"call.ringing\""));
            True(ringing.Contains("\"remotePartyNumber\":\"1208\""));
            True(ringing.Contains("\"contextProviderCallId\":\"1785994319.2999991\""));
            True(!ringing.Contains("incomingLineNumber"));

            string inboundRinging = GatewayEventPayload.ObservedRinging(
                configuration,
                "1785994319.3000011",
                "inbound",
                "external",
                "01012345678",
                "07000004591",
                null,
                "sip",
                "none").ToJson();
            True(inboundRinging.Contains("\"eventType\":\"call.ringing\""));
            True(inboundRinging.Contains(
                "\"incomingLineNumber\":\"07000004591\""));
            True(!inboundRinging.Contains("callerNumber"));

            string channels = GatewayEventPayload.ObservedChannels(
                configuration,
                "1785994319.3000001",
                "1785994319.3000002",
                "internal",
                "internal",
                "4591",
                "1208",
                "sip",
                "sip").ToJson();
            True(channels.Contains("\"eventType\":\"call.channels\""));
            True(channels.Contains("\"relatedProviderCallId\":\"1785994319.3000002\""));

            string ended = GatewayEventPayload.ObservedEnded(
                configuration,
                "1785994319.3000002",
                "0",
                "16",
                "sip",
                "sip").ToJson();
            True(ended.Contains("\"eventType\":\"call.ended\""));
            True(!ended.Contains("sourceProviderCallId"));

            string sentinelEnded = GatewayEventPayload.ObservedEnded(
                configuration,
                "1785994319.3000002",
                "NONE",
                "16",
                "sip",
                "sip").ToJson();
            True(!sentinelEnded.Contains("sourceProviderCallId"));
        }

        private static void GatewayPermanentFailureDisposition()
        {
            DateTime now = new DateTime(2026, 8, 10, 2, 30, 0, DateTimeKind.Utc);
            DateTime old = now.AddMinutes(-2);
            DateTime recent = now.AddSeconds(-30);

            True(GatewayDeliveryDispositionPolicy.ShouldDeadLetter(
                409, old, now));
            True(GatewayDeliveryDispositionPolicy.ShouldDeadLetter(
                400, old, now));
            True(!GatewayDeliveryDispositionPolicy.ShouldDeadLetter(
                409, recent, now));
            True(!GatewayDeliveryDispositionPolicy.ShouldDeadLetter(
                401, old, now));
            True(!GatewayDeliveryDispositionPolicy.ShouldDeadLetter(
                503, old, now));
            True(GatewayDeliveryDispositionPolicy.ShouldContinueQueue(400));
            True(GatewayDeliveryDispositionPolicy.ShouldContinueQueue(409));
            True(!GatewayDeliveryDispositionPolicy.ShouldContinueQueue(401));
            True(!GatewayDeliveryDispositionPolicy.ShouldContinueQueue(429));
            True(!GatewayDeliveryDispositionPolicy.ShouldContinueQueue(503));
        }

        private static void ProvisioningEnvelopeCompatibility()
        {
            byte[] secret = new byte[32];
            for (int index = 0; index < secret.Length; index++)
            {
                secret[index] = 7;
            }
            GatewayCredentialEnvelope envelope = new GatewayCredentialEnvelope
            {
                Algorithm = "A256CBC-HS256",
                Iv = "AAECAwQFBgcICQoLDA0ODw",
                Ciphertext =
                    "3ENNLpwpRBAfxyMgX6vN6hygtuSoZzf9rVNe_GtTAMDONFy_" +
                    "cnZvfud6hvi16AHyr14ICn-f44UllOmYyQOk3A",
                Mac = "VLebi_32-gIzNif86Gn_YKSHFZaDhmR5xd8arcHgXgc"
            };
            CentrexCredential credential = ProvisioningEnvelope.DecryptWithSecret(
                "01980000-0000-7000-8000-000000000071",
                envelope,
                secret);
            Equal("07046074535", credential.LoginId);
            Equal("bridge-password-test", credential.Password);
            Array.Clear(secret, 0, secret.Length);
        }

        private static void ProvisioningNetworkErrorDeferred()
        {
            True(ProvisioningFailurePolicy.ShouldDeferNetworkError(true));
            True(!ProvisioningFailurePolicy.ShouldDeferNetworkError(false));
        }

        private static void ProvisioningExtensionLoginFallback()
        {
            True(ProvisioningFailurePolicy.ShouldRetryWithExtensionLogin(
                true,
                false,
                -1,
                "07046071208",
                "1208"));
            True(!ProvisioningFailurePolicy.ShouldRetryWithExtensionLogin(
                true,
                false,
                -2,
                "07046071208",
                "1208"));
            True(!ProvisioningFailurePolicy.ShouldRetryWithExtensionLogin(
                true,
                true,
                -1,
                "07046071208",
                "1208"));
            True(!ProvisioningFailurePolicy.ShouldRetryWithExtensionLogin(
                false,
                false,
                -1,
                "07046071208",
                "1208"));
            True(!ProvisioningFailurePolicy.ShouldRetryWithExtensionLogin(
                true,
                false,
                -1,
                "1208",
                "1208"));
        }

        private static void MultiInstanceDataDirectory()
        {
            string root = Path.Combine(
                Path.GetTempPath(),
                "lawand-centrex-selftest-" + Guid.NewGuid().ToString("N"));
            string instanceDirectory = Path.Combine(root, "instances", "lawand-slot-001");
            string configurationPath = Path.Combine(instanceDirectory, "bridge.json");
            Directory.CreateDirectory(instanceDirectory);
            try
            {
                File.WriteAllText(
                    configurationPath,
                    "{\"bridgeId\":\"lawand-slot-001\"," +
                    "\"endpointId\":\"01980000-0000-7000-8000-000000000091\"," +
                    "\"credentialTarget\":\"Lawand/Centrex/lawand-slot-001\"," +
                    "\"gatewayUrl\":\"https://gateway.example.com/v1/centrex-bridge/events\"," +
                    "\"gatewayCredentialTarget\":\"Lawand/CentrexGateway/lawand-slot-001\"," +
                    "\"expectedExtension\":\"0000\"," +
                    "\"expectedLineLast4\":\"0000\"," +
                    "\"showTrayIcon\":false," +
                    "\"poolSlotPending\":true}",
                    new UTF8Encoding(false));
                BridgeConfiguration configuration = BridgeConfiguration.Load(
                    configurationPath);
                Equal(
                    Path.GetFullPath(instanceDirectory),
                    configuration.DataDirectory);
                True(!configuration.TrayIconEnabled);
                True(configuration.IsPoolSlotPending);
                True(configuration.MutexName.EndsWith("lawand-slot-001"));
            }
            finally
            {
                if (Directory.Exists(root))
                {
                    Directory.Delete(root, true);
                }
            }
        }

        private static void ResetPoolSlotConfiguration()
        {
            string root = Path.Combine(
                Path.GetTempPath(),
                "lawand-centrex-reset-selftest-" + Guid.NewGuid().ToString("N"));
            string instanceDirectory = Path.Combine(root, "instances", "lawand-slot-002");
            string configurationPath = Path.Combine(instanceDirectory, "bridge.json");
            Directory.CreateDirectory(instanceDirectory);
            try
            {
                File.WriteAllText(
                    configurationPath,
                    "{\"bridgeId\":\"lawand-slot-002\"," +
                    "\"endpointId\":\"01980000-0000-7000-8000-000000000092\"," +
                    "\"credentialTarget\":\"Lawand/Centrex/lawand-slot-002\"," +
                    "\"gatewayUrl\":\"https://gateway.example.com/v1/centrex-bridge/events\"," +
                    "\"gatewayCredentialTarget\":\"Lawand/CentrexGateway/lawand-slot-002\"," +
                    "\"expectedExtension\":\"1208\"," +
                    "\"expectedLineLast4\":\"1208\"," +
                    "\"showTrayIcon\":false," +
                    "\"poolSlotPending\":false}",
                    new UTF8Encoding(false));
                BridgeConfiguration configuration = BridgeConfiguration.Load(
                    configurationPath);
                configuration.UpdateEndpoint(
                    "01980000-0000-7000-8000-000000000093",
                    "0000",
                    "0000");

                BridgeConfiguration reset = BridgeConfiguration.Load(configurationPath);
                Equal("01980000-0000-7000-8000-000000000093", reset.EndpointId);
                Equal("0000", reset.ExpectedExtension);
                Equal("0000", reset.ExpectedLineLast4);
                True(reset.IsPoolSlotPending);
            }
            finally
            {
                if (Directory.Exists(root))
                {
                    Directory.Delete(root, true);
                }
            }
        }

        private static void CallObservationExpiry()
        {
            DateTimeOffset currentTime = new DateTimeOffset(
                2026,
                8,
                10,
                1,
                30,
                0,
                TimeSpan.Zero);
            True(CallObservationExpiryPolicy.ShouldExpire(
                false,
                currentTime.AddMinutes(-3),
                currentTime));
            True(!CallObservationExpiryPolicy.ShouldExpire(
                false,
                currentTime.AddMinutes(-2),
                currentTime));
            True(!CallObservationExpiryPolicy.ShouldExpire(
                true,
                currentTime.AddHours(-1),
                currentTime));
        }

        private static void CallObservationTracking()
        {
            DateTimeOffset currentTime = new DateTimeOffset(
                2026,
                8,
                12,
                4,
                30,
                0,
                TimeSpan.Zero);
            CallObservationTracker tracker = new CallObservationTracker();
            tracker.TrackRinging(
                "1786502776.3124029",
                currentTime,
                "sip",
                "sip");
            True(tracker.TakeExpiredUnconnected(
                currentTime.AddMinutes(2)).Count == 0);
            True(tracker.TakeExpiredUnconnected(
                currentTime.AddMinutes(3)).Count == 1);
            True(tracker.Count == 0);

            tracker.TrackRinging(
                "1786490370.3081116",
                currentTime,
                "sip",
                "sip");
            True(tracker.MarkConnected(
                "1786490370.3081116",
                "1786490370.3081117") == 1);
            True(tracker.TakeExpiredUnconnected(
                currentTime.AddHours(1)).Count == 0);
            True(tracker.RemoveRelated(
                "1786490370.3081118",
                "NONE") == 1);
            True(tracker.Count == 0);

            tracker.TrackRinging(
                "1786505309.3128987",
                currentTime,
                "sip",
                "local");
            True(tracker.Drain().Count == 1);
            True(tracker.Count == 0);
        }

        private static void Run(string name, Action test)
        {
            try
            {
                test();
                Console.WriteLine("PASS " + name);
            }
            catch (Exception exception)
            {
                _failed++;
                Console.WriteLine("FAIL " + name + ": " + exception.Message);
            }
        }

        private static void Equal(string expected, string actual)
        {
            if (!string.Equals(expected, actual, StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "expected=" + expected + ", actual=" + actual);
            }
        }

        private static void True(bool condition)
        {
            if (!condition)
            {
                throw new InvalidOperationException("condition was false");
            }
        }
    }
}
