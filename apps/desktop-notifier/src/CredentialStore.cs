using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Lawand.DesktopNotifier
{
    internal sealed class StoredCredential
    {
        public StoredCredential(string userName, string secret)
        {
            UserName = userName;
            Secret = secret;
        }

        public string UserName { get; private set; }
        public string Secret { get; private set; }
    }

    internal static class CredentialStore
    {
        private const uint CredTypeGeneric = 1;
        private const uint CredPersistLocalMachine = 2;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct NativeCredential
        {
            public uint Flags;
            public uint Type;
            public string TargetName;
            public string Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public uint CredentialBlobSize;
            public IntPtr CredentialBlob;
            public uint Persist;
            public uint AttributeCount;
            public IntPtr Attributes;
            public string TargetAlias;
            public string UserName;
        }

        [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CredRead(
            string target,
            uint type,
            uint reservedFlag,
            out IntPtr credentialPtr);

        [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CredWrite(ref NativeCredential credential, uint flags);

        [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CredDelete(string target, uint type, uint flags);

        [DllImport("advapi32.dll", SetLastError = false)]
        private static extern void CredFree(IntPtr credentialPtr);

        public static bool TryRead(string target, out StoredCredential credential)
        {
            credential = null;
            IntPtr credentialPtr;
            if (!CredRead(target, CredTypeGeneric, 0, out credentialPtr))
            {
                int error = Marshal.GetLastWin32Error();
                if (error == 1168)
                {
                    return false;
                }

                throw new Win32Exception(error, "PC 알림 인증정보를 읽지 못했습니다.");
            }

            try
            {
                NativeCredential nativeCredential =
                    (NativeCredential)Marshal.PtrToStructure(
                        credentialPtr,
                        typeof(NativeCredential));
                string secret = nativeCredential.CredentialBlobSize == 0
                    ? string.Empty
                    : Marshal.PtrToStringUni(
                        nativeCredential.CredentialBlob,
                        checked((int)nativeCredential.CredentialBlobSize / 2));
                if (string.IsNullOrWhiteSpace(nativeCredential.UserName) ||
                    string.IsNullOrEmpty(secret))
                {
                    return false;
                }

                credential = new StoredCredential(nativeCredential.UserName, secret);
                return true;
            }
            finally
            {
                CredFree(credentialPtr);
            }
        }

        public static void Write(string target, string deviceId, string token)
        {
            if (string.IsNullOrWhiteSpace(deviceId) || string.IsNullOrEmpty(token))
            {
                throw new ArgumentException("PC 기기 ID와 인증 토큰이 필요합니다.");
            }

            byte[] secretBytes = Encoding.Unicode.GetBytes(token);
            IntPtr secretPtr = Marshal.AllocCoTaskMem(secretBytes.Length);
            try
            {
                Marshal.Copy(secretBytes, 0, secretPtr, secretBytes.Length);
                NativeCredential credential = new NativeCredential();
                credential.Type = CredTypeGeneric;
                credential.TargetName = target;
                credential.Comment = "LAW& OS Desktop Notification Device";
                credential.CredentialBlobSize = checked((uint)secretBytes.Length);
                credential.CredentialBlob = secretPtr;
                credential.Persist = CredPersistLocalMachine;
                credential.UserName = deviceId;
                if (!CredWrite(ref credential, 0))
                {
                    throw new Win32Exception(
                        Marshal.GetLastWin32Error(),
                        "PC 알림 인증정보를 저장하지 못했습니다.");
                }
            }
            finally
            {
                for (int index = 0; index < secretBytes.Length; index++)
                {
                    secretBytes[index] = 0;
                    Marshal.WriteByte(secretPtr, index, 0);
                }
                Marshal.FreeCoTaskMem(secretPtr);
            }
        }

        public static void Delete(string target)
        {
            if (CredDelete(target, CredTypeGeneric, 0))
            {
                return;
            }
            int error = Marshal.GetLastWin32Error();
            if (error != 1168)
            {
                throw new Win32Exception(error, "PC 알림 인증정보를 삭제하지 못했습니다.");
            }
        }
    }
}
