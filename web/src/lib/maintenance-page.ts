export function renderMaintenancePage() {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#f4f8fc" />
    <title>서비스 점검 안내 | 유스플랜AI</title>
    <style>
      :root {
        color-scheme: light;
        --blue: #005eb8;
        --blue-dark: #004483;
        --green: #00a59c;
        --ink: #17202a;
        --muted: #5f6b76;
        --line: #dce7f0;
        --surface: rgba(255, 255, 255, 0.92);
      }

      * { box-sizing: border-box; }

      html, body { min-height: 100%; }

      body {
        margin: 0;
        min-height: 100dvh;
        overflow-x: hidden;
        color: var(--ink);
        background:
          radial-gradient(circle at 14% 14%, rgba(0, 178, 169, 0.12), transparent 30rem),
          radial-gradient(circle at 88% 82%, rgba(0, 94, 184, 0.14), transparent 34rem),
          #f4f8fc;
        font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        word-break: keep-all;
      }

      body::before,
      body::after {
        position: fixed;
        z-index: 0;
        width: 16rem;
        height: 16rem;
        border: 1px solid rgba(0, 94, 184, 0.08);
        border-radius: 999px;
        content: "";
      }

      body::before { top: -8rem; right: -5rem; }
      body::after { bottom: -10rem; left: -6rem; width: 22rem; height: 22rem; }

      main {
        position: relative;
        z-index: 1;
        display: grid;
        min-height: 100dvh;
        place-items: center;
        padding: max(1.5rem, env(safe-area-inset-top)) 1.25rem max(1.5rem, env(safe-area-inset-bottom));
      }

      .card {
        width: min(100%, 34rem);
        padding: clamp(2rem, 7vw, 3.5rem);
        text-align: center;
        background: var(--surface);
        border: 1px solid rgba(255, 255, 255, 0.9);
        border-radius: 2rem;
        box-shadow: 0 1.5rem 4.5rem rgba(15, 51, 82, 0.12), 0 0 0 1px rgba(0, 94, 184, 0.04);
        backdrop-filter: blur(18px);
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2rem;
        padding: 0.42rem 0.8rem;
        color: var(--blue-dark);
        background: #eaf4fd;
        border: 1px solid #d4e7f8;
        border-radius: 999px;
        font-size: 0.82rem;
        font-weight: 750;
        letter-spacing: -0.01em;
      }

      .status-dot {
        width: 0.48rem;
        height: 0.48rem;
        background: var(--green);
        border-radius: 50%;
        box-shadow: 0 0 0 0.28rem rgba(0, 165, 156, 0.12);
        animation: breathe 2.2s ease-in-out infinite;
      }

      .symbol {
        position: relative;
        display: grid;
        width: 6.25rem;
        height: 6.25rem;
        margin: 2rem auto 1.75rem;
        place-items: center;
        color: white;
        background: linear-gradient(145deg, var(--blue) 0%, #1682d4 58%, var(--green) 140%);
        border-radius: 2.15rem;
        box-shadow: 0 1.25rem 2.5rem rgba(0, 94, 184, 0.23);
        transform: rotate(-3deg);
      }

      .symbol::after {
        position: absolute;
        inset: 0.42rem;
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: 1.82rem;
        content: "";
      }

      .symbol svg { width: 3rem; height: 3rem; transform: rotate(3deg); }

      h1 {
        margin: 0;
        font-size: clamp(1.9rem, 7vw, 2.55rem);
        font-weight: 850;
        line-height: 1.18;
        letter-spacing: -0.045em;
      }

      .lead {
        margin: 1rem auto 0;
        color: var(--muted);
        font-size: clamp(0.98rem, 3.5vw, 1.08rem);
        line-height: 1.75;
        letter-spacing: -0.015em;
      }

      .notice {
        display: flex;
        align-items: flex-start;
        gap: 0.7rem;
        margin: 1.75rem 0 0;
        padding: 1rem 1.05rem;
        color: #43515e;
        text-align: left;
        background: #f7fafc;
        border: 1px solid var(--line);
        border-radius: 1rem;
        font-size: 0.88rem;
        line-height: 1.55;
      }

      .notice svg { flex: none; width: 1.15rem; height: 1.15rem; margin-top: 0.12rem; color: var(--blue); }

      .retry {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        width: 100%;
        min-height: 3.25rem;
        margin-top: 1rem;
        color: white;
        text-decoration: none;
        background: var(--blue);
        border-radius: 1rem;
        box-shadow: 0 0.65rem 1.4rem rgba(0, 94, 184, 0.18);
        font-size: 0.98rem;
        font-weight: 760;
        transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
      }

      .retry:hover { background: var(--blue-dark); box-shadow: 0 0.8rem 1.8rem rgba(0, 68, 131, 0.22); transform: translateY(-1px); }
      .retry:active { transform: translateY(0); }
      .retry:focus-visible { outline: 3px solid rgba(0, 94, 184, 0.24); outline-offset: 3px; }
      .retry svg { width: 1rem; height: 1rem; }

      footer {
        margin-top: 1.8rem;
        color: #82909c;
        font-size: 0.78rem;
        letter-spacing: -0.01em;
      }

      @keyframes breathe {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.55; transform: scale(0.82); }
      }

      @media (max-width: 520px) {
        main { padding-right: 1rem; padding-left: 1rem; }
        .card { padding: 2rem 1.35rem 1.75rem; border-radius: 1.6rem; }
        .symbol { width: 5.5rem; height: 5.5rem; margin-top: 1.65rem; border-radius: 1.9rem; }
        .symbol::after { border-radius: 1.6rem; }
      }

      @media (prefers-reduced-motion: reduce) {
        .status-dot { animation: none; }
        .retry { transition: none; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card" aria-labelledby="maintenance-title">
        <div class="status"><span class="status-dot" aria-hidden="true"></span>복구 작업 중</div>

        <div class="symbol" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <path d="M28.2 10.1a10.5 10.5 0 0 0-11.8 13.7L7.8 32.4a4 4 0 0 0 5.7 5.7l8.6-8.6a10.5 10.5 0 0 0 13.7-11.8l-6.2 6.2-5.5-1.5-1.5-5.5 5.6-6.8Z" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="m35.8 9.4.9-2.5.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9Z" fill="currentColor" />
          </svg>
        </div>

        <h1 id="maintenance-title">잠시 점검 중입니다</h1>
        <p class="lead">
          AI 인터뷰 제공사의 일시적인 장애로<br />
          현재 서비스 이용이 어렵습니다.<br />
          안정적인 서비스를 위해 복구 중입니다.
        </p>

        <div class="notice">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
            <path d="M12 10.5v5M12 7.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <span>복구가 완료되는 대로 서비스를 재개하겠습니다.<br />잠시 후 다시 확인해 주세요.</span>
        </div>

        <a class="retry" href="/">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          다시 확인하기
        </a>

        <footer>유스플랜AI · 인천 청년의 내일을 듣습니다</footer>
      </section>
    </main>
  </body>
</html>`;
}
