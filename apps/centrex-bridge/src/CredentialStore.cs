using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Lawand.CentrexBridge
{
    internal sealed class CentrexCredential
    {
        public CentrexCredential(string loginId, string password)
        {
            LoginId = loginId;
            Password = password;
        }

        public string LoginId { get; private set; }
        public string Password { get; private set; }
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

        public static CentrexCredential Read(string target)
        {
            CentrexCredential credential;
            if (TryRead(target, out credential))
            {
                return credential;
            }

            throw new InvalidOperationException(
                "Windows 자격 증명 관리자에 센트릭스 로그인이 없습니다.");
        }

        public static bool TryRead(string target, out CentrexCredential credential)
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

                throw new Win32Exception(error, "센트릭스 자격 증명을 읽지 못했습니다.");
            }

            try
            {
                NativeCredential nativeCredential =
                    (NativeCredential)Marshal.PtrToStructure(credentialPtr, typeof(NativeCredential));
                string password = nativeCredential.CredentialBlobSize == 0
                    ? string.Empty
                    : Marshal.PtrToStringUni(
                        nativeCredential.CredentialBlob,
                        checked((int)nativeCredential.CredentialBlobSize / 2));

                if (string.IsNullOrWhiteSpace(nativeCredential.UserName) || string.IsNullOrEmpty(password))
                {
                    throw new InvalidOperationException("저장된 센트릭스 자격 증명이 비어 있습니다.");
                }

                credential = new CentrexCredential(nativeCredential.UserName, password);
                return true;
            }
            finally
            {
                CredFree(credentialPtr);
            }
        }

        public static void Write(string target, string loginId, string password)
        {
            if (string.IsNullOrWhiteSpace(loginId) || string.IsNullOrEmpty(password))
            {
                throw new ArgumentException("센트릭스 ID와 비밀번호가 모두 필요합니다.");
            }

            byte[] passwordBytes = Encoding.Unicode.GetBytes(password);
            IntPtr passwordPtr = Marshal.AllocCoTaskMem(passwordBytes.Length);
            try
            {
                Marshal.Copy(passwordBytes, 0, passwordPtr, passwordBytes.Length);
                NativeCredential credential = new NativeCredential();
                credential.Type = CredTypeGeneric;
                credential.TargetName = target;
                credential.Comment = "Lawand Centrex Bridge";
                credential.CredentialBlobSize = checked((uint)passwordBytes.Length);
                credential.CredentialBlob = passwordPtr;
                credential.Persist = CredPersistLocalMachine;
                credential.UserName = loginId;

                if (!CredWrite(ref credential, 0))
                {
                    throw new Win32Exception(
                        Marshal.GetLastWin32Error(),
                        "센트릭스 자격 증명을 저장하지 못했습니다.");
                }
            }
            finally
            {
                for (int index = 0; index < passwordBytes.Length; index++)
                {
                    passwordBytes[index] = 0;
                }

                for (int offset = 0; offset < passwordBytes.Length; offset++)
                {
                    Marshal.WriteByte(passwordPtr, offset, 0);
                }

                Marshal.FreeCoTaskMem(passwordPtr);
            }
        }

        public static void Delete(string target)
        {
            if (CredDelete(target, CredTypeGeneric, 0))
            {
                return;
            }

            int error = Marshal.GetLastWin32Error();
            if (error == 1168)
            {
                return;
            }

            throw new Win32Exception(error, "센트릭스 자격 증명을 삭제하지 못했습니다.");
        }
    }
}
