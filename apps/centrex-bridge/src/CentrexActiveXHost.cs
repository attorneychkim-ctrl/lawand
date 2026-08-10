using System;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Lawand.CentrexBridge
{
    internal delegate void CentrexStringEvent(ref string value);
    internal delegate void CentrexNoArgumentEvent();
    internal delegate void CentrexTwoStringEvent(ref string name, ref string value);

    internal sealed class CentrexActiveXHost : AxHost
    {
        private const string CentrexClassId = "86019F2F-2899-4C4C-A6FE-24CFF7CD6D4C";
        private const int GuidKindDefaultSourceDispatchInterface = 1;

        private object _control;
        private Guid _eventInterfaceId;
        private bool _eventsAttached;

        private CentrexStringEvent _ringDelegate;
        private CentrexStringEvent _channelListDelegate;
        private CentrexStringEvent _channelOutDelegate;
        private CentrexNoArgumentEvent _networkErrorDelegate;
        private CentrexStringEvent _loginResultDelegate;
        private CentrexStringEvent _commandResultDelegate;
        private CentrexTwoStringEvent _commandErrorDelegate;
        private CentrexNoArgumentEvent _readyStateDelegate;

        public CentrexActiveXHost()
            : base(CentrexClassId)
        {
        }

        public event EventHandler<CentrexRawEventArgs> RingReceived;
        public event EventHandler<CentrexRawEventArgs> ChannelListReceived;
        public event EventHandler<CentrexRawEventArgs> ChannelOutReceived;
        public event EventHandler NetworkErrorReceived;
        public event EventHandler<CentrexRawEventArgs> LoginResultReceived;
        public event EventHandler<CentrexRawEventArgs> CommandResultReceived;
        public event EventHandler<CentrexCommandErrorEventArgs> CommandErrorReceived;
        public event EventHandler ReadyStateChanged;

        public void InitializeControl()
        {
            CreateControl();
            _control = GetOcx();
            if (_control == null)
            {
                throw new InvalidOperationException("센트릭스 ActiveX 객체를 초기화하지 못했습니다.");
            }

            IProvideClassInfo2 classInfo = _control as IProvideClassInfo2;
            if (classInfo == null)
            {
                throw new InvalidOperationException("센트릭스 ActiveX 이벤트 정보를 찾지 못했습니다.");
            }

            int result = classInfo.GetGuid(
                GuidKindDefaultSourceDispatchInterface,
                out _eventInterfaceId);
            Marshal.ThrowExceptionForHR(result);
            AttachEvents();
        }

        public object InvokeOcxMethod(string methodName, params object[] arguments)
        {
            if (_control == null)
            {
                throw new InvalidOperationException("센트릭스 ActiveX가 아직 준비되지 않았습니다.");
            }

            return _control.GetType().InvokeMember(
                methodName,
                BindingFlags.InvokeMethod,
                null,
                _control,
                arguments,
                null,
                null,
                null);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                DetachEvents();
            }

            base.Dispose(disposing);
        }

        private void AttachEvents()
        {
            if (_eventsAttached)
            {
                return;
            }

            _ringDelegate = OnRing;
            _channelListDelegate = OnChannelList;
            _channelOutDelegate = OnChannelOut;
            _networkErrorDelegate = OnNetworkError;
            _loginResultDelegate = OnLoginResult;
            _commandResultDelegate = OnCommandResult;
            _commandErrorDelegate = OnCommandError;
            _readyStateDelegate = OnReadyState;

            ComEventsHelper.Combine(_control, _eventInterfaceId, 101, _ringDelegate);
            ComEventsHelper.Combine(_control, _eventInterfaceId, 102, _channelListDelegate);
            ComEventsHelper.Combine(_control, _eventInterfaceId, 103, _channelOutDelegate);
            ComEventsHelper.Combine(_control, _eventInterfaceId, 104, _networkErrorDelegate);
            ComEventsHelper.Combine(_control, _eventInterfaceId, 105, _loginResultDelegate);
            ComEventsHelper.Combine(_control, _eventInterfaceId, 106, _commandResultDelegate);
            ComEventsHelper.Combine(_control, _eventInterfaceId, 111, _commandErrorDelegate);
            ComEventsHelper.Combine(_control, _eventInterfaceId, -609, _readyStateDelegate);
            _eventsAttached = true;
        }

        private void DetachEvents()
        {
            if (!_eventsAttached || _control == null)
            {
                return;
            }

            RemoveEvent(101, _ringDelegate);
            RemoveEvent(102, _channelListDelegate);
            RemoveEvent(103, _channelOutDelegate);
            RemoveEvent(104, _networkErrorDelegate);
            RemoveEvent(105, _loginResultDelegate);
            RemoveEvent(106, _commandResultDelegate);
            RemoveEvent(111, _commandErrorDelegate);
            RemoveEvent(-609, _readyStateDelegate);
            _eventsAttached = false;
        }

        private void RemoveEvent(int dispatchId, Delegate handler)
        {
            try
            {
                ComEventsHelper.Remove(_control, _eventInterfaceId, dispatchId, handler);
            }
            catch (InvalidComObjectException)
            {
            }
            catch (COMException)
            {
            }
        }

        private void OnRing(ref string value)
        {
            RaiseRaw(RingReceived, value);
        }

        private void OnChannelList(ref string value)
        {
            RaiseRaw(ChannelListReceived, value);
        }

        private void OnChannelOut(ref string value)
        {
            RaiseRaw(ChannelOutReceived, value);
        }

        private void OnNetworkError()
        {
            EventHandler handler = NetworkErrorReceived;
            if (handler != null)
            {
                handler(this, EventArgs.Empty);
            }
        }

        private void OnLoginResult(ref string value)
        {
            RaiseRaw(LoginResultReceived, value);
        }

        private void OnCommandResult(ref string value)
        {
            RaiseRaw(CommandResultReceived, value);
        }

        private void OnCommandError(ref string name, ref string value)
        {
            EventHandler<CentrexCommandErrorEventArgs> handler = CommandErrorReceived;
            if (handler != null)
            {
                handler(this, new CentrexCommandErrorEventArgs(name, value));
            }
        }

        private void OnReadyState()
        {
            EventHandler handler = ReadyStateChanged;
            if (handler != null)
            {
                handler(this, EventArgs.Empty);
            }
        }

        private void RaiseRaw(EventHandler<CentrexRawEventArgs> handler, string value)
        {
            if (handler != null)
            {
                handler(this, new CentrexRawEventArgs(value));
            }
        }

        [ComImport]
        [Guid("A6BC3AC0-DBAA-11CE-9DE3-00AA004BB851")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IProvideClassInfo2
        {
            [PreserveSig]
            int GetClassInfo(out IntPtr typeInfo);

            [PreserveSig]
            int GetGuid(int guidKind, out Guid guid);
        }
    }

    internal sealed class CentrexRawEventArgs : EventArgs
    {
        public CentrexRawEventArgs(string raw)
        {
            Raw = raw ?? string.Empty;
        }

        public string Raw { get; private set; }
    }

    internal sealed class CentrexCommandErrorEventArgs : EventArgs
    {
        public CentrexCommandErrorEventArgs(string name, string value)
        {
            Name = name ?? string.Empty;
            Value = value ?? string.Empty;
        }

        public string Name { get; private set; }
        public string Value { get; private set; }
    }
}
