"use client";

function ThemeIcon({ kind }: { kind: "light" | "dark" }) {
  return kind === "light" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3.75" />
      <path d="M12 2.25v2M12 19.75v2M4.25 12h-2M21.75 12h-2M5.1 5.1 3.7 3.7M20.3 20.3l-1.4-1.4M18.9 5.1l1.4-1.4M3.7 20.3l1.4-1.4" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20.25 15.15A8.5 8.5 0 0 1 8.85 3.75 8.5 8.5 0 1 0 20.25 15.15Z" />
    </svg>
  );
}

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      window.localStorage.setItem("lawand-erp-theme", next);
    } catch {
      // 저장소가 차단된 브라우저에서도 현재 탭의 테마 전환은 유지한다.
    }
  }

  return (
    <button
      aria-label="화면 테마 전환"
      className="theme-toggle"
      onClick={toggleTheme}
      title="다크·라이트 모드 전환"
      type="button"
    >
      <span className="theme-icon theme-icon-light">
        <ThemeIcon kind="light" />
      </span>
      <span className="theme-icon theme-icon-dark">
        <ThemeIcon kind="dark" />
      </span>
      <span className="theme-toggle-label">테마</span>
    </button>
  );
}
