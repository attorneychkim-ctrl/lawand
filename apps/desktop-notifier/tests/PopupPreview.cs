using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace Lawand.DesktopNotifier.Tests
{
    internal static class PopupPreview
    {
        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                NotificationKind kind = ParseKind(args);
                NotificationPresentation presentation =
                    NotificationPresentation.ForKind(kind);
                string title;
                string body;
                Sample(kind, out title, out body);
                NotificationPopupForm window = new NotificationPopupForm(
                    presentation,
                    title,
                    body,
                    presentation.Realtime
                        ? "실시간 · 직접 닫거나 2분 후 정리"
                        : kind == NotificationKind.Summary
                            ? "한 장만 확인하면 됩니다"
                            : "잠시 후 자동으로 닫힘",
                    presentation.OpenActionText,
                    0);
                Rectangle workingArea = Screen.PrimaryScreen.WorkingArea;
                window.Left = workingArea.Right - window.Width - 18;
                window.Top = workingArea.Top + 18;
                window.OpenRequested += delegate { window.Close(); };
                Application.Run(window);
                return 0;
            }
            catch (Exception exception)
            {
                Console.Error.WriteLine(exception.ToString());
                return 1;
            }
        }

        private static NotificationKind ParseKind(string[] args)
        {
            string value = args != null && args.Length > 0
                ? args[0].Trim().ToLowerInvariant()
                : "consultation";
            switch (value)
            {
                case "message":
                    return NotificationKind.Message;
                case "review":
                    return NotificationKind.Review;
                case "phone":
                    return NotificationKind.ExternalPhone;
                case "internal":
                    return NotificationKind.InternalPhone;
                case "transfer":
                    return NotificationKind.Transfer;
                case "summary":
                    return NotificationKind.Summary;
                case "test":
                    return NotificationKind.Test;
                default:
                    return NotificationKind.Consultation;
            }
        }

        private static void Sample(
            NotificationKind kind,
            out string title,
            out string body)
        {
            switch (kind)
            {
                case NotificationKind.Message:
                    title = "새 문자 · 김로앤";
                    body =
                        "고객명: 김로앤\r\n" +
                        "전화번호: 010-1234-5678\r\n" +
                        "연결 구분: 담당 고객 회신\r\n" +
                        "문자 내용: 서류 준비가 끝났습니다. 오늘 오후에 방문해도 될까요? 준비할 서류도 다시 알려주세요.";
                    return;
                case NotificationKind.Review:
                    title = "담당 고객 후기 · 김로앤";
                    body =
                        "고객명: 김로앤\r\n" +
                        "연락처: 010-1234-5678\r\n" +
                        "연결 사건: 2026개회12345 · 개인회생\r\n" +
                        "후기 내용: 친절하게 설명해 주셔서 복잡한 절차를 잘 마쳤습니다. 진행 상황도 빠르게 알려주셔서 안심했습니다.";
                    return;
                case NotificationKind.ExternalPhone:
                    title = "[서울] 내 담당·내 회선 전화 · 김로앤";
                    body =
                        "고객명: 김로앤\r\n" +
                        "전화번호: 010-1234-5678\r\n" +
                        "지역: 서울\r\n" +
                        "수신 회선: 서울 대표번호\r\n" +
                        "알림 구분: 내 담당·내 회선";
                    return;
                case NotificationKind.InternalPhone:
                    title = "내선 전화 · 김직원 · 내선 203";
                    body =
                        "발신 직원: 김직원\r\n" +
                        "발신 내선: 203\r\n" +
                        "수신 회선: 서울 사무실\r\n" +
                        "수신 내선: 201";
                    return;
                case NotificationKind.Transfer:
                    title = "[서울] 호전환 전화 · 김로앤";
                    body =
                        "고객명: 김로앤\r\n" +
                        "전화번호: 010-1234-5678\r\n" +
                        "지역: 서울\r\n" +
                        "수신 회선: 서울 대표번호\r\n" +
                        "전화 상태: 고객 호전환";
                    return;
                case NotificationKind.Summary:
                    Dictionary<NotificationKind, int> counts =
                        new Dictionary<NotificationKind, int>();
                    counts[NotificationKind.ExternalPhone] = 2;
                    counts[NotificationKind.Consultation] = 4;
                    counts[NotificationKind.Message] = 3;
                    counts[NotificationKind.Review] = 1;
                    title = "자리 비운 동안 알림 10건";
                    body = NotificationPresentation.SummaryBody(counts);
                    return;
                case NotificationKind.Test:
                    title = "LAW& OS 테스트 알림 · 김로앤";
                    body =
                        "고객명: 김로앤\r\n" +
                        "전화번호: 010-0000-0000\r\n" +
                        "알림 목적: 우측 상단 업무 카드 표시 확인\r\n" +
                        "테스트 내용: 항목 배지와 실제 내용 필드가 정확히 보이는지 확인합니다.";
                    return;
                default:
                    title = "담당 상담 재요청 · 김로앤";
                    body =
                        "고객명: 김로앤\r\n" +
                        "전화번호: 010-1234-5678\r\n" +
                        "접수 채널: 전화 상담\r\n" +
                        "거주 지역: 서울\r\n" +
                        "도움 분야: 개인회생\r\n" +
                        "상담 내용: 오늘 오후에 다시 통화하고 싶습니다. 준비해야 할 서류와 예상 절차도 함께 안내받고 싶습니다.";
                    return;
            }
        }
    }
}
