// app/widget/script/route.ts
import { NextResponse } from "next/server";

const WIDGET_JS = `(() => {
  // Prevent double-initialization
  if (window.__convergoWidgetLoaded) return;
  window.__convergoWidgetLoaded = true;

  // If running inside an iframe, do nothing (prevents recursion when /embed loads widget)
  const inIframe = window.self !== window.top;
  if (inIframe) return;

  const scriptEl =
    document.currentScript || [...document.scripts].slice(-1)[0];

  const site = (scriptEl && scriptEl.getAttribute("data-site")) || "default";

  // Button label + theme (configurable)
  const label =
    (scriptEl && scriptEl.getAttribute("data-label")) || "See live";
  const theme =
    ((scriptEl && scriptEl.getAttribute("data-theme")) || "burgundy").toLowerCase();

  // Auto-open is SAFE-BY-DEFAULT (OFF).
  // It will ONLY auto-open if BOTH are set:
  //   data-auto-open="true" AND data-auto-open-mode="force"
  const autoOpenAttr =
    (scriptEl && scriptEl.getAttribute("data-auto-open")) || "";
  const autoOpenMode =
    (scriptEl && scriptEl.getAttribute("data-auto-open-mode")) || "";
  const autoOpen =
    (autoOpenAttr === "true" || autoOpenAttr === "1") &&
    autoOpenMode === "force";

  // Derive Convergo origin from script src (works on preview/prod)
  const scriptSrc = (scriptEl && scriptEl.src) || "";
  const convergoOrigin = scriptSrc
    ? new URL(scriptSrc).origin
    : "https://convergo.live";

  const BTN_ID = "convergo-widget-button";
  const BACKDROP_ID = "convergo-backdrop";
  const MODAL_ID = "convergo-modal";
  const CLOSE_ID = "convergo-close";
  const IFRAME_ID = "convergo-iframe";
  const FOOTER_ID = "convergo-footer";
  const STYLE_ID = "convergo-styles";

  // Action attributes for robust event delegation
  const ACTION_ATTR = "data-cvg-action";
  const ACTION_OPEN = "open";
  const ACTION_CLOSE = "close";

  const el = (id) => document.getElementById(id);

  let listenersBound = false;
  let isOpen = false;
  let prevBodyOverflow = "";

  function lockScroll() {
    prevBodyOverflow = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
  }

  function unlockScroll() {
    document.body.style.overflow = prevBodyOverflow;
  }

  function getThemeVars() {
    // You can add themes later without touching layout logic
    if (theme === "burgundy") {
      return {
        bg: "#6b0f2e",       // burgundy
        fg: "#ffffff",       // white text
      };
    }
    if (theme === "mint") {
      return {
        bg: "#1bbf82",
        fg: "#0b2b1f",
      };
    }
    // default fallback
    return {
      bg: "#6b0f2e",
      fg: "#ffffff",
    };
  }

  function ensureStyles() {
    if (el(STYLE_ID)) return;
    const { bg, fg } = getThemeVars();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = \`
      #\${BTN_ID}{
        position:fixed; right:24px; bottom:24px; z-index:2147483647;
        padding:14px 20px; border-radius:999px; border:0;
        background:\${bg}; color:\${fg}; font-weight:700;
        letter-spacing:.2px;
        box-shadow:0 10px 30px rgba(0,0,0,.22);
        cursor:pointer;
      }
      #\${BACKDROP_ID}{
        position:fixed; inset:0; z-index:2147483646;
        background:rgba(0,0,0,.45);
      }
      #\${MODAL_ID}{
        position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
        width:min(900px, calc(100vw - 32px));
        height:min(650px, calc(100vh - 32px));
        z-index:2147483647;
        background:#0b0f14; border-radius:16px;
        box-shadow:0 20px 60px rgba(0,0,0,.45);
        overflow:hidden;
        display:flex; flex-direction:column;
      }
      #\${CLOSE_ID}{
        position:absolute; right:14px; top:10px;
        width:40px; height:40px; border-radius:999px;
        border:0; background:rgba(255,255,255,.08);
        color:white; font-size:22px; cursor:pointer; z-index:2;
      }
      #\${IFRAME_ID}{
        width:100%; height:100%; border:0; flex:1;
      }
      #\${FOOTER_ID}{
        padding:10px 14px;
        font:12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial;
        color:rgba(255,255,255,.65);
        border-top:1px solid rgba(255,255,255,.08);
        text-align:center;
      }
    \`;
    document.head.appendChild(style);
  }

  function ensureUI() {
    ensureStyles();

    // Button
    if (!el(BTN_ID)) {
      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.type = "button";
      btn.textContent = label; // ✅ "See live" default
      btn.setAttribute(ACTION_ATTR, ACTION_OPEN);
      document.body.appendChild(btn);
    }

    // Backdrop
    if (!el(BACKDROP_ID)) {
      const bd = document.createElement("div");
      bd.id = BACKDROP_ID;
      bd.style.display = "none";
      bd.setAttribute(ACTION_ATTR, ACTION_CLOSE);
      document.body.appendChild(bd);
    }

    // Modal
    if (!el(MODAL_ID)) {
      const modal = document.createElement("div");
      modal.id = MODAL_ID;
      modal.style.display = "none";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-hidden", "true");

      const close = document.createElement("button");
      close.id = CLOSE_ID;
      close.type = "button";
      close.setAttribute("aria-label", "Close ConVergo panel");
      close.setAttribute(ACTION_ATTR, ACTION_CLOSE);
      close.innerHTML = "&times;";

      const iframe = document.createElement("iframe");
      iframe.id = IFRAME_ID;
      iframe.loading = "lazy";
      iframe.src = \`\${convergoOrigin}/embed?site=\${encodeURIComponent(site)}\`;

      const footer = document.createElement("div");
      footer.id = FOOTER_ID;
      footer.textContent = "Powered by ConVergo & ChatGPT";

      modal.appendChild(close);
      modal.appendChild(iframe);
      modal.appendChild(footer);
      document.body.appendChild(modal);
    }

    bindGlobalListenersOnce();
  }

  function bindGlobalListenersOnce() {
    if (listenersBound) return;
    listenersBound = true;

    document.addEventListener("click", (e) => {
      const target =
        e.target && e.target.closest
          ? e.target.closest(\`[\${ACTION_ATTR}]\`)
          : null;
      if (!target) return;

      const action = target.getAttribute(ACTION_ATTR);
      if (action === ACTION_OPEN) openModal();
      if (action === ACTION_CLOSE) closeModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) closeModal();
    });
  }

  function openModal() {
    ensureUI();

    const modal = el(MODAL_ID);
    const bd = el(BACKDROP_ID);
    const btn = el(BTN_ID);

    if (!modal || !bd || !btn) return;
    if (isOpen) return;

    bd.style.display = "block";
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    btn.style.display = "none";

    lockScroll();
    isOpen = true;
  }

  function closeModal() {
    const modal = el(MODAL_ID);
    const bd = el(BACKDROP_ID);
    const btn = el(BTN_ID);

    if (bd) bd.style.display = "none";
    if (modal) {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
    }
    if (btn) btn.style.display = "";

    if (isOpen) unlockScroll();
    isOpen = false;
  }

  // Boot
  ensureUI();

  // Auto-open is OFF unless explicitly forced
  if (autoOpen) openModal();
})();`;

export async function GET() {
  return new NextResponse(WIDGET_JS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
