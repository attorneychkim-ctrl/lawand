using System;
using System.Collections.Generic;
using System.Globalization;
using System.Windows.Forms;

namespace Lawand.CentrexBridge
{
    internal enum BridgeConnectionState
    {
        Starting,
        Connecting,
        Connected,
        Reconnecting,
        ConfigurationError,
        Stopped
    }

    internal sealed class BridgeStatusEventArgs : EventArgs
    {
        public BridgeStatusEventArgs(BridgeConnectionState state, string message)
        {
            State = state;
            Message = message;
        }

        public BridgeConnectionState State { get; private set; }
        public string Message { get; private set; }
    }

    internal sealed class InboundRingEventArgs : EventArgs
    {
        public InboundRingEventArgs(string uniqueId, string callerNumber, string incomingLineNumber)
        {
            UniqueId = uniqueId;
            CallerNumber = callerNumber;
            IncomingLineNumber = incomingLineNumber;
            MaskedCaller = CentrexEventParser.MaskPhone(callerNumber);
            MaskedIncomingLine = CentrexEventParser.MaskPhone(incomingLineNumber);
        }

        public string UniqueId { get; private set; }
        public string CallerNumber { get; private set; }
        public string IncomingLineNumber { get; private set; }
        public string MaskedCaller { get; private set; }
        public string MaskedIncomingLine { get; private set; }
    }

    internal sealed class BridgeProvisioningEventArgs : EventArgs
    {
        public BridgeProvisioningEventArgs(
            GatewayBridgeCommand command,
            bool succeeded,
            string resultCode)
        {
            Command = command;
            Succeeded = succeeded;
            ResultCode = resultCode;
        }

        public GatewayBridgeCommand Command { get; private set; }
        public bool Succeeded { get; private set; }
        public string ResultCode { get; private set; }
    }

    internal sealed class CentrexRuntime : IDisposable
    {
        private readonly BridgeConfiguration _configuration;
        private readonly SafeLogger _logger;
        private readonly CentrexActiveXHost _host;
        private readonly Timer _healthTimer;
        private readonly Timer _alternateLoginTimer;
        private readonly CallObservationTracker _callObservationTracker;

        private BridgeConnectionState _state;
        private bool _hostInitialized;
        private DateTimeOffset _nextReconnectAt;
        private int _reconnectAttempt;
        private bool _disposed;
        private bool _connectionIdentityRejected;
        private string _activeInboundUniqueId;
        private readonly HashSet<string> _activeInboundChannelUniqueIds =
            new HashSet<string>(StringComparer.Ordinal);
        private DateTimeOffset _activeInboundAt;
        private bool _activeInboundAnswered;
        private bool _activeInboundConnectedEventSent;
        private string _activeOutboundUniqueId;
        private readonly HashSet<string> _activeOutboundChannelUniqueIds =
            new HashSet<string>(StringComparer.Ordinal);
        private DateTimeOffset _activeOutboundAt;
        private bool _activeOutboundConnectedEventSent;
        private GatewayBridgeCommand _activeProvisioningCommand;
        private CentrexCredential _provisioningPreviousCredential;
        private string _provisioningPreviousEndpointId;
        private string _provisioningPreviousExtension;
        private string _provisioningPreviousLineLast4;
        private bool _provisioningHadPreviousCredential;
        private bool _provisioningAlternateLoginAttempted;

        public CentrexRuntime(
            BridgeConfiguration configuration,
            SafeLogger logger,
            CentrexActiveXHost host)
        {
            _configuration = configuration;
            _logger = logger;
            _host = host;
            _state = BridgeConnectionState.Starting;
            _healthTimer = new Timer();
            _healthTimer.Interval = configuration.HealthCheckSeconds * 1000;
            _healthTimer.Tick += HealthTimerTick;
            _alternateLoginTimer = new Timer();
            _alternateLoginTimer.Interval = 1000;
            _alternateLoginTimer.Tick += AlternateLoginTimerTick;
            _callObservationTracker = new CallObservationTracker();

            _host.RingReceived += HostRingReceived;
            _host.ChannelListReceived += HostChannelListReceived;
            _host.ChannelOutReceived += HostChannelOutReceived;
            _host.NetworkErrorReceived += HostNetworkErrorReceived;
            _host.LoginResultReceived += HostLoginResultReceived;
            _host.CommandResultReceived += HostCommandResultReceived;
            _host.CommandErrorReceived += HostCommandErrorReceived;
        }

        public event EventHandler<BridgeStatusEventArgs> StatusChanged;
        public event EventHandler<InboundRingEventArgs> InboundRingReceived;
        public event EventHandler<GatewayEventPayloadEventArgs> GatewayEventReady;
        public event EventHandler<BridgeProvisioningEventArgs> ProvisioningCompleted;

        public BridgeConnectionState State
        {
            get { return _state; }
        }

        public string ActiveInboundUniqueId
        {
            get { return _activeInboundUniqueId; }
        }

        public void Start()
        {
            ThrowIfDisposed();
            _healthTimer.Start();
            CentrexCredential credential;
            if (!CredentialStore.TryRead(
                _configuration.CredentialTarget,
                out credential))
            {
                _nextReconnectAt = DateTimeOffset.MaxValue;
                _logger.Info(
                    "BRIDGE_SLOT_IDLE",
                    "BRIDGE=" + _configuration.BridgeId);
                SetStatus(
                    BridgeConnectionState.ConfigurationError,
                    "ERP 직원 회선 배정을 기다리는 빈 브리지 슬롯입니다.");
                return;
            }
            credential = null;
            EnsureHostInitialized();
            Connect(true);
        }

        public void ReconnectNow()
        {
            ThrowIfDisposed();
            CentrexCredential credential;
            if (!CredentialStore.TryRead(
                _configuration.CredentialTarget,
                out credential))
            {
                _nextReconnectAt = DateTimeOffset.MaxValue;
                SetStatus(
                    BridgeConnectionState.ConfigurationError,
                    "ERP 직원 회선 배정을 기다리는 빈 브리지 슬롯입니다.");
                return;
            }
            credential = null;
            EnsureHostInitialized();
            _connectionIdentityRejected = false;
            _reconnectAttempt = 0;
            TryDisconnect("BRIDGE_RECONNECT");
            Connect(true);
        }

        public void Disconnect()
        {
            ThrowIfDisposed();
            _healthTimer.Stop();
            TryDisconnect("BRIDGE_DISCONNECT");
            SetStatus(BridgeConnectionState.Stopped, "사용자가 연결을 해제했습니다.");
        }

        public bool TryAnswer(string expectedUniqueId, out string reason)
        {
            ThrowIfDisposed();
            if (_state != BridgeConnectionState.Connected)
            {
                reason = "centrex_not_connected";
                return false;
            }

            if (string.IsNullOrWhiteSpace(_activeInboundUniqueId))
            {
                reason = "no_active_inbound_ring";
                return false;
            }

            if (!string.Equals(
                _activeInboundUniqueId,
                expectedUniqueId,
                StringComparison.Ordinal))
            {
                reason = "ring_unique_id_mismatch";
                return false;
            }

            if (_activeInboundAnswered)
            {
                reason = "already_answered";
                return false;
            }

            if (DateTimeOffset.UtcNow - _activeInboundAt > TimeSpan.FromMinutes(3))
            {
                CompensateActiveInboundCall("BRIDGE_RING_TIMEOUT");
                reason = "ring_expired";
                return false;
            }

            _host.InvokeOcxMethod("Answer");
            _activeInboundAnswered = true;
            _logger.Info(
                "ANSWER_REQUESTED",
                "UNIQUEID=" + CentrexEventParser.SafeToken(expectedUniqueId, 80));
            reason = "accepted";
            return true;
        }

        public bool TryProvision(GatewayBridgeCommand command, out string reason)
        {
            ThrowIfDisposed();
            if (command == null ||
                !string.Equals(command.CommandType, "provision", StringComparison.Ordinal))
            {
                reason = "invalid_provision_command";
                return false;
            }
            if (_activeProvisioningCommand != null)
            {
                reason = "provision_already_active";
                return false;
            }
            if (!string.IsNullOrWhiteSpace(_activeInboundUniqueId) ||
                !string.IsNullOrWhiteSpace(_activeOutboundUniqueId))
            {
                reason = "active_call";
                return false;
            }

            CentrexCredential previousCredential = null;
            CentrexCredential nextCredential = null;
            bool credentialChanged = false;
            string previousEndpointId = _configuration.EndpointId;
            string previousExtension = _configuration.ExpectedExtension;
            string previousLineLast4 = _configuration.ExpectedLineLast4;
            bool hadPreviousCredential = false;
            try
            {
                hadPreviousCredential = CredentialStore.TryRead(
                    _configuration.CredentialTarget,
                    out previousCredential);
                nextCredential = ProvisioningEnvelope.Decrypt(
                    _configuration,
                    command.CommandId,
                    command.CredentialEnvelope);
                CredentialStore.Write(
                    _configuration.CredentialTarget,
                    nextCredential.LoginId,
                    nextCredential.Password);
                credentialChanged = true;
                _configuration.UpdateEndpoint(
                    command.EndpointId,
                    command.ExpectedExtension,
                    command.ExpectedLineLast4);
                EnsureHostInitialized();
                _provisioningPreviousCredential = previousCredential;
                _provisioningPreviousEndpointId = previousEndpointId;
                _provisioningPreviousExtension = previousExtension;
                _provisioningPreviousLineLast4 = previousLineLast4;
                _provisioningHadPreviousCredential = hadPreviousCredential;
            }
            catch (Exception exception)
            {
                if (credentialChanged)
                {
                    try
                    {
                        if (hadPreviousCredential && previousCredential != null)
                        {
                            CredentialStore.Write(
                                _configuration.CredentialTarget,
                                previousCredential.LoginId,
                                previousCredential.Password);
                        }
                        else
                        {
                            CredentialStore.Delete(
                                _configuration.CredentialTarget);
                        }
                        _configuration.UpdateEndpoint(
                            previousEndpointId,
                            previousExtension,
                            previousLineLast4);
                    }
                    catch (Exception restoreException)
                    {
                        _logger.Error(
                            "PROVISION_CREDENTIAL_ROLLBACK_FAILED",
                            restoreException);
                    }
                }
                _logger.Error("PROVISION_APPLY_FAILED", exception);
                reason = "provision_apply_failed";
                return false;
            }
            finally
            {
                previousCredential = null;
                nextCredential = null;
            }

            _connectionIdentityRejected = false;
            _reconnectAttempt = 0;
            _provisioningAlternateLoginAttempted = false;
            TryDisconnect("BRIDGE_RECONFIGURED");
            _activeProvisioningCommand = command;
            _logger.Info(
                "PROVISION_APPLIED",
                "COMMAND=" + command.CommandId,
                "EXTENSION_SUFFIX=" + LastDigits(command.ExpectedExtension, 4),
                "LINE_SUFFIX=" + command.ExpectedLineLast4);
            Connect(true);
            reason = "accepted";
            return true;
        }

        public bool TryResetToIdle(GatewayBridgeCommand command, out string reason)
        {
            ThrowIfDisposed();
            if (command == null ||
                !string.Equals(command.CommandType, "reset", StringComparison.Ordinal) ||
                !string.Equals(command.ExpectedExtension, "0000", StringComparison.Ordinal) ||
                !string.Equals(command.ExpectedLineLast4, "0000", StringComparison.Ordinal))
            {
                reason = "invalid_reset_command";
                return false;
            }
            if (_activeProvisioningCommand != null)
            {
                reason = "provision_already_active";
                return false;
            }
            if (!string.IsNullOrWhiteSpace(_activeInboundUniqueId) ||
                !string.IsNullOrWhiteSpace(_activeOutboundUniqueId))
            {
                reason = "active_call";
                return false;
            }

            try
            {
                TryDisconnect("BRIDGE_RECONFIGURED");
                CredentialStore.Delete(_configuration.CredentialTarget);
                _configuration.UpdateEndpoint(
                    command.EndpointId,
                    command.ExpectedExtension,
                    command.ExpectedLineLast4);
                _connectionIdentityRejected = false;
                _reconnectAttempt = 0;
                _nextReconnectAt = DateTimeOffset.MaxValue;
                _logger.Info(
                    "BRIDGE_RESET_TO_IDLE",
                    "COMMAND=" + command.CommandId,
                    "BRIDGE=" + _configuration.BridgeId);
                SetStatus(
                    BridgeConnectionState.ConfigurationError,
                    "ERP 직원 회선 배정을 기다리는 빈 브리지 슬롯입니다.");
                reason = "reset_to_idle";
                return true;
            }
            catch (Exception exception)
            {
                _logger.Error("BRIDGE_RESET_FAILED", exception);
                reason = "reset_failed";
                return false;
            }
        }

        private void Connect(bool manual)
        {
            if (_connectionIdentityRejected || _disposed)
            {
                return;
            }

            EnsureHostInitialized();

            CentrexCredential credential;
            try
            {
                if (!CredentialStore.TryRead(
                    _configuration.CredentialTarget,
                    out credential))
                {
                    _nextReconnectAt = DateTimeOffset.MaxValue;
                    SetStatus(
                        BridgeConnectionState.ConfigurationError,
                        "ERP 직원 회선 배정을 기다리는 빈 브리지 슬롯입니다.");
                    return;
                }
            }
            catch (Exception exception)
            {
                _logger.Error("CREDENTIAL_READ_FAILED", exception);
                SetStatus(
                    BridgeConnectionState.ConfigurationError,
                    "Windows 자격 증명 관리자에서 로그인을 확인하세요.");
                return;
            }

            SetStatus(
                manual ? BridgeConnectionState.Connecting : BridgeConnectionState.Reconnecting,
                manual ? "센트릭스에 연결 중입니다." : "센트릭스 연결을 확인 중입니다.");

            try
            {
                _host.InvokeOcxMethod(
                    "SetAutoReconnect",
                    checked((short)_configuration.AutoReconnectSeconds));
                _host.InvokeOcxMethod(
                    "LoginServer",
                    credential.LoginId,
                    credential.Password,
                    string.Empty);
                _nextReconnectAt = DateTimeOffset.UtcNow.AddSeconds(
                    Math.Max(30, _configuration.AutoReconnectSeconds));
                _logger.Info("LOGIN_REQUESTED", "ATTEMPT=" + _reconnectAttempt.ToString(CultureInfo.InvariantCulture));
            }
            catch (Exception exception)
            {
                _logger.Error("LOGIN_REQUEST_FAILED", Unwrap(exception));
                ScheduleReconnect("센트릭스 로그인 요청에 실패했습니다.");
            }
            finally
            {
                credential = null;
            }
        }

        private void HostLoginResultReceived(object sender, CentrexRawEventArgs eventArgs)
        {
            ParsedCentrexEvent parsed = CentrexEventParser.Parse(eventArgs.Raw);
            string status = CentrexEventParser.SafeToken(parsed.Get("STATUS"), 20);
            string extension = parsed.Get("EXTEN");
            string callerId = parsed.Get("CALLERID");
            int numericStatus;
            bool loginSucceeded = int.TryParse(
                status,
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out numericStatus) && numericStatus > 0;

            _logger.Info(
                "LOGIN_RESULT",
                "STATUS=" + status,
                "EXTEN_SUFFIX=" + LastDigits(extension, 4),
                "LINE=" + CentrexEventParser.MaskPhone(callerId));

            if (!loginSucceeded)
            {
                if (TryRetryProvisioningWithExtensionLogin(numericStatus))
                {
                    return;
                }
                CompleteProvisioning(false, "centrex_login_rejected");
                ScheduleReconnect("센트릭스 로그인이 거부됐습니다.");
                return;
            }

            bool extensionMatches = CentrexEventParser.EndsWithDigits(
                extension,
                _configuration.ExpectedExtension);
            bool lineMatches = CentrexEventParser.EndsWithDigits(
                callerId,
                _configuration.ExpectedLineLast4);
            if (!extensionMatches || !lineMatches)
            {
                _connectionIdentityRejected = true;
                TryDisconnect("BRIDGE_IDENTITY_MISMATCH");
                _logger.Warn(
                    "LOGIN_IDENTITY_MISMATCH",
                    "EXTENSION_MATCH=" + (extensionMatches ? "1" : "0"),
                    "LINE_MATCH=" + (lineMatches ? "1" : "0"));
                SetStatus(
                    BridgeConnectionState.ConfigurationError,
                    "설정한 내선 또는 회선과 로그인 결과가 다릅니다.");
                CompleteProvisioning(false, "centrex_identity_mismatch");
                return;
            }

            _reconnectAttempt = 0;
            CompensateActiveCalls("BRIDGE_RECONNECT");
            SetStatus(BridgeConnectionState.Connected, "센트릭스 수신 대기 중입니다.");
            CompleteProvisioning(true, "centrex_login_succeeded");
        }

        private bool TryRetryProvisioningWithExtensionLogin(int loginStatus)
        {
            CentrexCredential credential = null;
            try
            {
                if (!CredentialStore.TryRead(
                    _configuration.CredentialTarget,
                    out credential) ||
                    !ProvisioningFailurePolicy.ShouldRetryWithExtensionLogin(
                        _activeProvisioningCommand != null,
                        _provisioningAlternateLoginAttempted,
                        loginStatus,
                        credential.LoginId,
                        _configuration.ExpectedExtension))
                {
                    return false;
                }

                _provisioningAlternateLoginAttempted = true;
                string extensionLoginId =
                    CentrexEventParser.DigitsOnly(_configuration.ExpectedExtension);
                CredentialStore.Write(
                    _configuration.CredentialTarget,
                    extensionLoginId,
                    credential.Password);
                _logger.Info(
                    "PROVISION_LOGIN_ID_FALLBACK",
                    "LOGIN_SUFFIX=" + LastDigits(extensionLoginId, 4));
                _connectionIdentityRejected = false;
                _reconnectAttempt = 0;
                TryDisconnect("BRIDGE_RECONNECT");
                _alternateLoginTimer.Stop();
                _alternateLoginTimer.Start();
                return true;
            }
            catch (Exception exception)
            {
                _logger.Error("PROVISION_LOGIN_ID_FALLBACK_FAILED", exception);
                return false;
            }
            finally
            {
                credential = null;
            }
        }

        private void AlternateLoginTimerTick(object sender, EventArgs eventArgs)
        {
            _alternateLoginTimer.Stop();
            if (_disposed || _activeProvisioningCommand == null)
            {
                return;
            }

            _logger.Info("PROVISION_LOGIN_ID_FALLBACK_CONNECT");
            Connect(true);
        }

        private void HostRingReceived(object sender, CentrexRawEventArgs eventArgs)
        {
            ParsedCentrexEvent parsed = CentrexEventParser.Parse(eventArgs.Raw);
            string isDial = CentrexEventParser.SafeToken(parsed.Get("ISDIAL"), 8);
            string uniqueId = CentrexEventParser.SafeToken(parsed.Get("UNIQUEID"), 80);
            string maskedCaller = CentrexEventParser.MaskPhone(parsed.Get("CALLERID"));
            string incomingLine = CentrexEventParser.MaskPhone(parsed.Get("INEXTEN"));
            string agentSuffix = LastDigits(parsed.Get("AGENT"), 4);

            _logger.Info(
                "RING_EVENT",
                "ISDIAL=" + isDial,
                "CALLER=" + maskedCaller,
                "CALLER_KIND=" + CentrexEventParser.CallPartyKind(parsed.Get("CALLERID")),
                "LINE=" + incomingLine,
                "AGENT_SUFFIX=" + agentSuffix,
                "CHANNEL_KIND=" + CentrexEventParser.ChannelKind(parsed.Get("CHANNEL")),
                "RECHANNEL_KIND=" + CentrexEventParser.ChannelKind(parsed.Get("RECHANNEL")),
                "UNIQUEID=" + uniqueId);

            if (uniqueId.Length == 0 ||
                (!string.Equals(isDial, "0", StringComparison.Ordinal) &&
                 !string.Equals(isDial, "1", StringComparison.Ordinal)))
            {
                return;
            }

            if (!CentrexEventParser.EndsWithDigits(
                parsed.Get("AGENT"),
                _configuration.ExpectedExtension))
            {
                _logger.Warn("RING_REJECTED", "REASON=extension_mismatch", "UNIQUEID=" + uniqueId);
                return;
            }

            string callerKind = CentrexEventParser.CallPartyKind(parsed.Get("CALLERID"));
            string direction = string.Equals(isDial, "1", StringComparison.Ordinal)
                ? "outbound"
                : "inbound";
            string observationIncomingLine = parsed.Get("INEXTEN");
            if (CentrexEventParser.DigitsOnly(observationIncomingLine).Length < 2)
            {
                observationIncomingLine = _configuration.ExpectedExtension;
            }
            string contextProviderCallId = null;
            if (string.Equals(callerKind, "internal", StringComparison.Ordinal))
            {
                contextProviderCallId = !string.IsNullOrWhiteSpace(_activeInboundUniqueId)
                    ? _activeInboundUniqueId
                    : _activeOutboundUniqueId;
            }
            try
            {
                string channelKind = CentrexEventParser.ChannelKind(
                    parsed.Get("CHANNEL"));
                string relatedChannelKind = CentrexEventParser.ChannelKind(
                    parsed.Get("RECHANNEL"));
                RaiseGatewayEvent(GatewayEventPayload.ObservedRinging(
                    _configuration,
                    uniqueId,
                    direction,
                    callerKind,
                    parsed.Get("CALLERID"),
                    observationIncomingLine,
                    contextProviderCallId,
                    channelKind,
                    relatedChannelKind));
                _callObservationTracker.TrackRinging(
                    uniqueId,
                    DateTimeOffset.UtcNow,
                    channelKind,
                    relatedChannelKind);
            }
            catch (ArgumentException)
            {
                _logger.Warn(
                    "CALL_OBSERVATION_REJECTED",
                    "TYPE=ringing",
                    "UNIQUEID=" + uniqueId);
            }

            if (!string.Equals(callerKind, "external", StringComparison.Ordinal))
            {
                _logger.Info(
                    "LEGACY_CALL_EVENT_SKIPPED",
                    "REASON=non_external_party",
                    "UNIQUEID=" + uniqueId);
                return;
            }

            if (string.Equals(isDial, "1", StringComparison.Ordinal))
            {
                GatewayEventPayload payload;
                try
                {
                    payload = GatewayEventPayload.OutboundRinging(
                        _configuration,
                        uniqueId,
                        parsed.Get("CALLERID"));
                }
                catch (ArgumentException)
                {
                    _logger.Warn(
                        "RING_REJECTED",
                        "REASON=invalid_outbound_number",
                        "UNIQUEID=" + uniqueId);
                    return;
                }
                _activeOutboundUniqueId = uniqueId;
                _activeOutboundChannelUniqueIds.Clear();
                _activeOutboundChannelUniqueIds.Add(uniqueId);
                _activeOutboundAt = DateTimeOffset.UtcNow;
                _activeOutboundConnectedEventSent = false;
                RaiseGatewayEvent(payload);
                return;
            }

            if (!CentrexEventParser.EndsWithDigits(
                parsed.Get("INEXTEN"),
                _configuration.ExpectedLineLast4))
            {
                _logger.Info(
                    "LEGACY_CALL_EVENT_SKIPPED",
                    "REASON=transferred_incoming_line",
                    "UNIQUEID=" + uniqueId);
                return;
            }

            GatewayEventPayload inboundPayload;
            try
            {
                inboundPayload = GatewayEventPayload.Ringing(
                    _configuration,
                    uniqueId,
                    parsed.Get("CALLERID"),
                    parsed.Get("INEXTEN"));
            }
            catch (ArgumentException)
            {
                _logger.Warn(
                    "RING_REJECTED",
                    "REASON=invalid_inbound_number",
                    "UNIQUEID=" + uniqueId);
                return;
            }
            _activeInboundUniqueId = uniqueId;
            _activeInboundChannelUniqueIds.Clear();
            _activeInboundChannelUniqueIds.Add(uniqueId);
            _activeInboundAt = DateTimeOffset.UtcNow;
            _activeInboundAnswered = false;
            _activeInboundConnectedEventSent = false;
            EventHandler<InboundRingEventArgs> handler = InboundRingReceived;
            if (handler != null)
            {
                handler(this, new InboundRingEventArgs(
                    uniqueId,
                    parsed.Get("CALLERID"),
                    parsed.Get("INEXTEN")));
            }
            RaiseGatewayEvent(inboundPayload);
        }

        private void HostChannelListReceived(object sender, CentrexRawEventArgs eventArgs)
        {
            ParsedCentrexEvent parsed = CentrexEventParser.Parse(eventArgs.Raw);
            _logger.Info(
                "CHANNEL_LIST",
                "CHANNEL1_KIND=" + CentrexEventParser.ChannelKind(parsed.Get("CHANNEL1")),
                "CHANNEL2_KIND=" + CentrexEventParser.ChannelKind(parsed.Get("CHANNEL2")),
                "CALLER1=" + CentrexEventParser.MaskPhone(parsed.Get("CALLER1ID")),
                "CALLER1_KIND=" + CentrexEventParser.CallPartyKind(parsed.Get("CALLER1ID")),
                "CALLER2=" + CentrexEventParser.MaskPhone(parsed.Get("CALLER2ID")),
                "CALLER2_KIND=" + CentrexEventParser.CallPartyKind(parsed.Get("CALLER2ID")),
                "UNIQUEID1=" + CentrexEventParser.SafeToken(parsed.Get("UNIQUEID1"), 80),
                "UNIQUEID2=" + CentrexEventParser.SafeToken(parsed.Get("UNIQUEID2"), 80));

            string uniqueId1 = CentrexEventParser.SafeToken(parsed.Get("UNIQUEID1"), 80);
            string uniqueId2 = CentrexEventParser.SafeToken(parsed.Get("UNIQUEID2"), 80);
            if (!string.IsNullOrWhiteSpace(uniqueId1) &&
                !string.IsNullOrWhiteSpace(uniqueId2))
            {
                try
                {
                    RaiseGatewayEvent(GatewayEventPayload.ObservedChannels(
                        _configuration,
                        uniqueId1,
                        uniqueId2,
                        CentrexEventParser.CallPartyKind(parsed.Get("CALLER1ID")),
                        CentrexEventParser.CallPartyKind(parsed.Get("CALLER2ID")),
                        parsed.Get("CALLER1ID"),
                        parsed.Get("CALLER2ID"),
                        CentrexEventParser.ChannelKind(parsed.Get("CHANNEL1")),
                        CentrexEventParser.ChannelKind(parsed.Get("CHANNEL2"))));
                    _callObservationTracker.MarkConnected(uniqueId1, uniqueId2);
                }
                catch (ArgumentException)
                {
                    _logger.Warn(
                        "CALL_OBSERVATION_REJECTED",
                        "TYPE=channels",
                        "UNIQUEID=" + uniqueId1);
                }
            }
            if (TryHandleInboundChannelList(uniqueId1, uniqueId2) ||
                TryHandleOutboundChannelList(uniqueId1, uniqueId2))
            {
                return;
            }

            if (!string.IsNullOrWhiteSpace(_activeInboundUniqueId) ||
                !string.IsNullOrWhiteSpace(_activeOutboundUniqueId))
            {
                _logger.Warn("CHANNEL_LIST_IGNORED", "REASON=unrelated_call");
            }
        }

        private bool TryHandleInboundChannelList(string uniqueId1, string uniqueId2)
        {
            if (string.IsNullOrWhiteSpace(_activeInboundUniqueId) ||
                (!CentrexEventParser.IsRelatedUniqueId(_activeInboundUniqueId, uniqueId1) &&
                 !CentrexEventParser.IsRelatedUniqueId(_activeInboundUniqueId, uniqueId2)))
            {
                return false;
            }

            AddActiveInboundChannelUniqueId(uniqueId1);
            AddActiveInboundChannelUniqueId(uniqueId2);
            if (_activeInboundConnectedEventSent)
            {
                return true;
            }

            string channelId = !string.IsNullOrWhiteSpace(uniqueId1) &&
                !string.Equals(uniqueId1, _activeInboundUniqueId, StringComparison.Ordinal)
                    ? uniqueId1
                    : uniqueId2;
            _activeInboundConnectedEventSent = true;
            RaiseGatewayEvent(GatewayEventPayload.Connected(
                _configuration,
                _activeInboundUniqueId,
                channelId));
            return true;
        }

        private bool TryHandleOutboundChannelList(string uniqueId1, string uniqueId2)
        {
            if (string.IsNullOrWhiteSpace(_activeOutboundUniqueId) ||
                (!CentrexEventParser.IsRelatedUniqueId(_activeOutboundUniqueId, uniqueId1) &&
                 !CentrexEventParser.IsRelatedUniqueId(_activeOutboundUniqueId, uniqueId2)))
            {
                return false;
            }

            AddActiveOutboundChannelUniqueId(uniqueId1);
            AddActiveOutboundChannelUniqueId(uniqueId2);
            if (_activeOutboundConnectedEventSent)
            {
                return true;
            }

            string channelId = !string.IsNullOrWhiteSpace(uniqueId1) &&
                !string.Equals(uniqueId1, _activeOutboundUniqueId, StringComparison.Ordinal)
                    ? uniqueId1
                    : uniqueId2;
            _activeOutboundConnectedEventSent = true;
            RaiseGatewayEvent(GatewayEventPayload.OutboundConnected(
                _configuration,
                _activeOutboundUniqueId,
                channelId));
            return true;
        }

        private void HostChannelOutReceived(object sender, CentrexRawEventArgs eventArgs)
        {
            ParsedCentrexEvent parsed = CentrexEventParser.Parse(eventArgs.Raw);
            string uniqueId = CentrexEventParser.SafeToken(parsed.Get("UNIQUEID"), 80);
            string sourceUniqueId = CentrexEventParser.SafeToken(parsed.Get("SRCUNIQUEID"), 80);
            _logger.Info(
                "CHANNEL_OUT",
                "CHANNEL_KIND=" + CentrexEventParser.ChannelKind(parsed.Get("CHANNEL")),
                "RECHANNEL_KIND=" + CentrexEventParser.ChannelKind(parsed.Get("RECHANNEL")),
                "UNIQUEID=" + uniqueId,
                "SRCUNIQUEID=" + sourceUniqueId,
                "HCAUSE=" + CentrexEventParser.SafeToken(parsed.Get("HCAUSE"), 20));

            bool observationSent = false;
            if (!string.IsNullOrWhiteSpace(uniqueId))
            {
                try
                {
                    RaiseGatewayEvent(GatewayEventPayload.ObservedEnded(
                        _configuration,
                        uniqueId,
                        sourceUniqueId,
                        parsed.Get("HCAUSE"),
                        CentrexEventParser.ChannelKind(parsed.Get("CHANNEL")),
                        CentrexEventParser.ChannelKind(parsed.Get("RECHANNEL"))));
                    observationSent = true;
                }
                catch (ArgumentException)
                {
                    _logger.Warn(
                        "CALL_OBSERVATION_REJECTED",
                        "TYPE=ended",
                        "UNIQUEID=" + uniqueId);
                }
            }
            if (observationSent)
            {
                _callObservationTracker.RemoveRelated(uniqueId, sourceUniqueId);
            }

            bool inboundCallCanEnd = !string.IsNullOrWhiteSpace(_activeInboundUniqueId) &&
                (_activeInboundConnectedEventSent ||
                 DateTimeOffset.UtcNow - _activeInboundAt <= TimeSpan.FromMinutes(3));
            bool matchesInboundChannel =
                CentrexEventParser.IsRelatedUniqueId(
                    _activeInboundChannelUniqueIds,
                    uniqueId) ||
                CentrexEventParser.IsRelatedUniqueId(
                    _activeInboundChannelUniqueIds,
                    sourceUniqueId);
            if (inboundCallCanEnd && matchesInboundChannel)
            {
                RaiseGatewayEvent(GatewayEventPayload.Ended(
                    _configuration,
                    _activeInboundUniqueId,
                    parsed.Get("HCAUSE")));
                ClearActiveInboundCall();
                return;
            }

            bool outboundCallCanEnd = !string.IsNullOrWhiteSpace(_activeOutboundUniqueId) &&
                (_activeOutboundConnectedEventSent ||
                 DateTimeOffset.UtcNow - _activeOutboundAt <= TimeSpan.FromMinutes(3));
            bool matchesOutboundChannel =
                CentrexEventParser.IsRelatedUniqueId(
                    _activeOutboundChannelUniqueIds,
                    uniqueId) ||
                CentrexEventParser.IsRelatedUniqueId(
                    _activeOutboundChannelUniqueIds,
                    sourceUniqueId);
            if (outboundCallCanEnd && matchesOutboundChannel)
            {
                RaiseGatewayEvent(GatewayEventPayload.OutboundEnded(
                    _configuration,
                    _activeOutboundUniqueId,
                    parsed.Get("HCAUSE")));
                ClearActiveOutboundCall();
                return;
            }
            _logger.Warn(
                "CHANNEL_OUT_IGNORED",
                "REASON=" +
                    (inboundCallCanEnd || outboundCallCanEnd
                        ? "unrelated_channel"
                        : "no_active_call"));
        }

        private void AddActiveInboundChannelUniqueId(string uniqueId)
        {
            if (!string.IsNullOrWhiteSpace(uniqueId))
            {
                _activeInboundChannelUniqueIds.Add(uniqueId);
            }
        }

        private void AddActiveOutboundChannelUniqueId(string uniqueId)
        {
            if (!string.IsNullOrWhiteSpace(uniqueId))
            {
                _activeOutboundChannelUniqueIds.Add(uniqueId);
            }
        }

        private void ClearActiveInboundCall()
        {
            _activeInboundUniqueId = null;
            _activeInboundChannelUniqueIds.Clear();
            _activeInboundAnswered = false;
            _activeInboundConnectedEventSent = false;
        }

        private void ClearActiveOutboundCall()
        {
            _activeOutboundUniqueId = null;
            _activeOutboundChannelUniqueIds.Clear();
            _activeOutboundConnectedEventSent = false;
        }

        private void CompensateActiveInboundCall(string providerEndCause)
        {
            if (string.IsNullOrWhiteSpace(_activeInboundUniqueId))
            {
                return;
            }

            string uniqueId = _activeInboundUniqueId;
            try
            {
                RaiseGatewayEvent(GatewayEventPayload.Ended(
                    _configuration,
                    uniqueId,
                    providerEndCause));
                _logger.Warn(
                    "INBOUND_CALL_COMPENSATED",
                    "CAUSE=" + providerEndCause,
                    "UNIQUEID=" + uniqueId);
            }
            catch (Exception exception)
            {
                _logger.Error("INBOUND_CALL_COMPENSATION_FAILED", exception);
            }
            finally
            {
                ClearActiveInboundCall();
            }
        }

        private void CompensateActiveOutboundCall(string providerEndCause)
        {
            if (string.IsNullOrWhiteSpace(_activeOutboundUniqueId))
            {
                return;
            }

            string uniqueId = _activeOutboundUniqueId;
            try
            {
                RaiseGatewayEvent(GatewayEventPayload.OutboundEnded(
                    _configuration,
                    uniqueId,
                    providerEndCause));
                _logger.Warn(
                    "OUTBOUND_CALL_COMPENSATED",
                    "CAUSE=" + providerEndCause,
                    "UNIQUEID=" + uniqueId);
            }
            catch (Exception exception)
            {
                _logger.Error("OUTBOUND_CALL_COMPENSATION_FAILED", exception);
            }
            finally
            {
                ClearActiveOutboundCall();
            }
        }

        private void CompensateActiveCalls(string providerEndCause)
        {
            foreach (TrackedCallObservation observation in
                _callObservationTracker.Drain())
            {
                try
                {
                    RaiseGatewayEvent(GatewayEventPayload.ObservedEnded(
                        _configuration,
                        observation.ProviderCallId,
                        null,
                        providerEndCause,
                        observation.ChannelKind,
                        observation.RelatedChannelKind));
                    _logger.Warn(
                        "CALL_OBSERVATION_COMPENSATED",
                        "CAUSE=" + providerEndCause,
                        "UNIQUEID=" + observation.ProviderCallId);
                }
                catch (Exception exception)
                {
                    _logger.Error("CALL_OBSERVATION_COMPENSATION_FAILED", exception);
                }
            }
            CompensateActiveInboundCall(providerEndCause);
            CompensateActiveOutboundCall(providerEndCause);
        }

        private void HostNetworkErrorReceived(object sender, EventArgs eventArgs)
        {
            _logger.Warn("NETWORK_ERROR");
            if (ProvisioningFailurePolicy.ShouldDeferNetworkError(
                _activeProvisioningCommand != null))
            {
                _logger.Warn("PROVISION_NETWORK_ERROR_DEFERRED");
                ScheduleReconnect("센트릭스 새 회선 로그인 결과를 기다리는 중입니다.");
                return;
            }
            ScheduleReconnect("센트릭스 네트워크 연결이 끊어졌습니다.");
        }

        private void HostCommandResultReceived(object sender, CentrexRawEventArgs eventArgs)
        {
            ParsedCentrexEvent parsed = CentrexEventParser.Parse(eventArgs.Raw);
            _logger.Info(
                "COMMAND_RESULT",
                "CMD=" + CentrexEventParser.SafeToken(parsed.Get("CMD"), 60));
        }

        private void HostCommandErrorReceived(object sender, CentrexCommandErrorEventArgs eventArgs)
        {
            _logger.Warn(
                "COMMAND_ERROR",
                "EVENT=" + CentrexEventParser.SafeToken(eventArgs.Name, 60));
            if (string.Equals(eventArgs.Name, "Connect", StringComparison.OrdinalIgnoreCase))
            {
                CompleteProvisioning(false, "centrex_connect_error");
            }
        }

        private void CompleteProvisioning(bool succeeded, string resultCode)
        {
            GatewayBridgeCommand command = _activeProvisioningCommand;
            if (command == null)
            {
                return;
            }
            _activeProvisioningCommand = null;
            if (succeeded)
            {
                ClearProvisioningRollbackState();
            }
            else
            {
                RollbackProvisioning();
            }
            _logger.Info(
                "PROVISION_COMPLETED",
                "RESULT=" + resultCode,
                "SUCCEEDED=" + (succeeded ? "1" : "0"));
            EventHandler<BridgeProvisioningEventArgs> handler = ProvisioningCompleted;
            if (handler != null)
            {
                handler(this, new BridgeProvisioningEventArgs(
                    command,
                    succeeded,
                    resultCode));
            }
        }

        private void RollbackProvisioning()
        {
            CentrexCredential previousCredential = _provisioningPreviousCredential;
            string previousEndpointId = _provisioningPreviousEndpointId;
            string previousExtension = _provisioningPreviousExtension;
            string previousLineLast4 = _provisioningPreviousLineLast4;
            bool hadPreviousCredential = _provisioningHadPreviousCredential;
            ClearProvisioningRollbackState();
            if (string.IsNullOrWhiteSpace(previousEndpointId) ||
                string.IsNullOrWhiteSpace(previousExtension) ||
                string.IsNullOrWhiteSpace(previousLineLast4))
            {
                _logger.Warn("PROVISION_ROLLBACK_SKIPPED");
                return;
            }

            try
            {
                if (hadPreviousCredential && previousCredential != null)
                {
                    CredentialStore.Write(
                        _configuration.CredentialTarget,
                        previousCredential.LoginId,
                        previousCredential.Password);
                }
                else
                {
                    CredentialStore.Delete(_configuration.CredentialTarget);
                }
                _configuration.UpdateEndpoint(
                    previousEndpointId,
                    previousExtension,
                    previousLineLast4);
                _connectionIdentityRejected = false;
                _reconnectAttempt = 0;
                TryDisconnect("BRIDGE_RECONFIGURED");
                if (hadPreviousCredential)
                {
                    _logger.Info(
                        "PROVISION_ROLLED_BACK",
                        "EXTENSION_SUFFIX=" + LastDigits(previousExtension, 4),
                        "LINE_SUFFIX=" + previousLineLast4);
                    Connect(true);
                }
                else
                {
                    _nextReconnectAt = DateTimeOffset.MaxValue;
                    _logger.Info(
                        "PROVISION_ROLLED_BACK_TO_IDLE",
                        "BRIDGE=" + _configuration.BridgeId);
                    SetStatus(
                        BridgeConnectionState.ConfigurationError,
                        "ERP 직원 회선 배정을 기다리는 빈 브리지 슬롯입니다.");
                }
            }
            catch (Exception exception)
            {
                _logger.Error("PROVISION_ROLLBACK_FAILED", exception);
                SetStatus(
                    BridgeConnectionState.ConfigurationError,
                    "이전 센트릭스 회선 복구를 확인하세요.");
            }
            finally
            {
                previousCredential = null;
            }
        }

        private void ClearProvisioningRollbackState()
        {
            _alternateLoginTimer.Stop();
            _provisioningPreviousCredential = null;
            _provisioningPreviousEndpointId = null;
            _provisioningPreviousExtension = null;
            _provisioningPreviousLineLast4 = null;
            _provisioningHadPreviousCredential = false;
            _provisioningAlternateLoginAttempted = false;
        }

        private void HealthTimerTick(object sender, EventArgs eventArgs)
        {
            if (_disposed || _connectionIdentityRejected || _state == BridgeConnectionState.Stopped)
            {
                return;
            }

            if (!_hostInitialized)
            {
                return;
            }

            DateTimeOffset provisioningExpiresAt;
            if (_activeProvisioningCommand != null &&
                DateTimeOffset.TryParse(
                    _activeProvisioningCommand.ExpiresAt,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                    out provisioningExpiresAt) &&
                provisioningExpiresAt <= DateTimeOffset.UtcNow)
            {
                CompleteProvisioning(false, "provision_timeout");
                return;
            }

            ExpireStaleUnconnectedCalls();

            bool connected = false;
            try
            {
                object result = _host.InvokeOcxMethod("IsConnected");
                connected = result is bool && (bool)result;
            }
            catch (Exception exception)
            {
                _logger.Error("HEALTH_CHECK_FAILED", Unwrap(exception));
            }

            if (connected)
            {
                if (_state != BridgeConnectionState.Connected)
                {
                    SetStatus(BridgeConnectionState.Connected, "센트릭스 수신 대기 중입니다.");
                }

                return;
            }

            if (DateTimeOffset.UtcNow < _nextReconnectAt)
            {
                return;
            }

            Connect(false);
        }

        private void ExpireStaleUnconnectedCalls()
        {
            DateTimeOffset currentTime = DateTimeOffset.UtcNow;
            foreach (TrackedCallObservation observation in
                _callObservationTracker.TakeExpiredUnconnected(currentTime))
            {
                RaiseGatewayEvent(GatewayEventPayload.ObservedEnded(
                    _configuration,
                    observation.ProviderCallId,
                    null,
                    "BRIDGE_RING_TIMEOUT",
                    observation.ChannelKind,
                    observation.RelatedChannelKind));
                _logger.Warn(
                    "CALL_OBSERVATION_RING_EXPIRED",
                    "UNIQUEID=" + observation.ProviderCallId);
            }
            if (!string.IsNullOrWhiteSpace(_activeInboundUniqueId) &&
                CallObservationExpiryPolicy.ShouldExpire(
                    _activeInboundConnectedEventSent,
                    _activeInboundAt,
                    currentTime))
            {
                RaiseGatewayEvent(GatewayEventPayload.Ended(
                    _configuration,
                    _activeInboundUniqueId,
                    "BRIDGE_RING_TIMEOUT"));
                _logger.Warn(
                    "INBOUND_RING_EXPIRED",
                    "UNIQUEID=" + _activeInboundUniqueId);
                ClearActiveInboundCall();
            }
            if (!string.IsNullOrWhiteSpace(_activeOutboundUniqueId) &&
                CallObservationExpiryPolicy.ShouldExpire(
                    _activeOutboundConnectedEventSent,
                    _activeOutboundAt,
                    currentTime))
            {
                RaiseGatewayEvent(GatewayEventPayload.OutboundEnded(
                    _configuration,
                    _activeOutboundUniqueId,
                    "BRIDGE_RING_TIMEOUT"));
                _logger.Warn(
                    "OUTBOUND_RING_EXPIRED",
                    "UNIQUEID=" + _activeOutboundUniqueId);
                ClearActiveOutboundCall();
            }
        }

        private void ScheduleReconnect(string message)
        {
            CompensateActiveCalls("BRIDGE_RECONNECT");
            _reconnectAttempt = Math.Min(_reconnectAttempt + 1, 8);
            int multiplier = 1 << Math.Min(_reconnectAttempt - 1, 4);
            int delaySeconds = Math.Min(
                _configuration.AutoReconnectSeconds * multiplier,
                300);
            _nextReconnectAt = DateTimeOffset.UtcNow.AddSeconds(delaySeconds);
            _logger.Warn(
                "RECONNECT_SCHEDULED",
                "DELAY_SECONDS=" + delaySeconds.ToString(CultureInfo.InvariantCulture));
            SetStatus(BridgeConnectionState.Reconnecting, message);
        }

        private void TryDisconnect(string providerEndCause)
        {
            CompensateActiveCalls(providerEndCause);
            if (!_hostInitialized)
            {
                return;
            }

            try
            {
                _host.InvokeOcxMethod("DisconnectServer");
            }
            catch (Exception exception)
            {
                _logger.Error("DISCONNECT_FAILED", Unwrap(exception));
            }
        }

        private void EnsureHostInitialized()
        {
            if (_hostInitialized)
            {
                return;
            }

            _host.InitializeControl();
            _hostInitialized = true;
            _logger.Info(
                "HOST_READY",
                "BRIDGE=" + _configuration.BridgeId,
                "ENDPOINT=" + _configuration.EndpointId,
                "PROCESS=x86",
                "STA=1");
        }

        private void RaiseGatewayEvent(GatewayEventPayload payload)
        {
            EventHandler<GatewayEventPayloadEventArgs> handler = GatewayEventReady;
            if (handler != null)
            {
                handler(this, new GatewayEventPayloadEventArgs(payload));
            }
        }

        private void SetStatus(BridgeConnectionState state, string message)
        {
            _state = state;
            EventHandler<BridgeStatusEventArgs> handler = StatusChanged;
            if (handler != null)
            {
                handler(this, new BridgeStatusEventArgs(state, message));
            }
        }

        private static string LastDigits(string value, int count)
        {
            string digits = CentrexEventParser.DigitsOnly(value);
            if (digits.Length == 0)
            {
                return "unknown";
            }

            return digits.Substring(Math.Max(0, digits.Length - count));
        }

        private static Exception Unwrap(Exception exception)
        {
            System.Reflection.TargetInvocationException target =
                exception as System.Reflection.TargetInvocationException;
            return target != null && target.InnerException != null
                ? target.InnerException
                : exception;
        }

        private void ThrowIfDisposed()
        {
            if (_disposed)
            {
                throw new ObjectDisposedException("CentrexRuntime");
            }
        }

        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            _disposed = true;
            _healthTimer.Stop();
            _healthTimer.Dispose();
            _alternateLoginTimer.Stop();
            _alternateLoginTimer.Dispose();
            TryDisconnect("BRIDGE_PROCESS_STOPPED");
            _host.Dispose();
        }
    }

    internal sealed class GatewayEventPayloadEventArgs : EventArgs
    {
        public GatewayEventPayloadEventArgs(GatewayEventPayload payload)
        {
            Payload = payload;
        }

        public GatewayEventPayload Payload { get; private set; }
    }
}
