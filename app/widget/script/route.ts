// app/widget/script/route.ts
import { NextResponse } from "next/server";

const WIDGET_JS = `(() => {
  // Prevent double-initialization
  if (window.__convergoWidgetLoaded) return;
  window.__convergoWidgetLoaded = true;

  // ✅ IMPORTANT: If running inside an iframe, do nothing.
  // This prevents "modal inside modal" recursion when /embed loads the widget too.
  const inIframe = window.self !== window.top;
  if (inIframe) return;

  const scriptEl =
    document.currentScript || [...document.scripts].slice(-1)[0];

  const site = (scriptEl && scriptEl.getAttribute("data-site")) || "default";
  const autoOpen =
    (scriptEl && scriptEl.getAttribute("data-auto-open")) === "true";

  // Derive Convergo origin from script src (so it works on preview/prod)
  const scriptSrc = (scriptEl && scriptEl.src) || "";
  const convergoOrigin = scriptSrc ? new URL(scriptSrc).origin : "https://convergo.live";

  const BTN_ID = "convergo-widget-button";
  const BACKDROP_ID = "convergo-backdrop";
  const MODAL_ID = "convergo-modal";
  const CLOSE_ID = "convergo-close";
  const IFRAME_ID = "convergo-iframe";
  const FOOTER_ID = "convergo-footer";
  const STYLE_ID = "convergo-styles";

  const el = (id) => document.getElementById(id);

  function ensureStyles() {
    if (el(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = \`
      #\${BTN_ID}{
        position:fixed; right:24px; bottom:24px; z-index:2147483647;
        padding:14px 20px; border-radius:999px; border:0;
        background:#1bbf82; color:#0b2b1f; font-weight:600;
        box-shadow:0 10px 30px rgba(0,0,0,.2);
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
      btn.textContent = "ConVergo Live";
      btn.addEventListener("click", openModal);
      document.body.appendChild(btn);
    }

    // Backdrop
    if (!el(BACKDROP_ID)) {
      const bd = document.createElement("div");
      bd.id = BACKDROP_ID;
      bd.hidden = true;
      bd.addEventListener("click", closeModal);
      document.body.appendChild(bd);
    }

    // Modal
    if (!el(MODAL_ID)) {
      const modal = document.createElement("div");
      modal.id = MODAL_ID;
      modal.hidden = true;

      const close = document.createElement("button");
      close.id = CLOSE_ID;
      close.setAttribute("aria-label", "Close ConVergo panel");
      close.innerHTML = "&times;";
      close.addEventListener("click", closeModal);

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

    // ESC closes
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function openModal() {
    ensureUI();
    // ✅ Safety: if already open, do nothing
    if (el(MODAL_ID) && !el(MODAL_ID).hidden) return;

    el(BACKDROP_ID).hidden = false;
    el(MODAL_ID).hidden = false;
    el(BTN_ID).style.display = "none";
  }

  function closeModal() {
    if (el(BACKDROP_ID)) el(BACKDROP_ID).hidden = true;
    if (el(MODAL_ID)) el(MODAL_ID).hidden = true;
    if (el(BTN_ID)) el(BTN_ID).style.display = "";
  }

  // Boot
  ensureUI();
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
