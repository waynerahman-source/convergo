// app/widget/script/route.ts
import { NextResponse } from "next/server";

const WIDGET_JS = `(() => {
  // Prevent double-initialization
  if (window.__convergoWidgetLoaded) return;
  window.__convergoWidgetLoaded = true;

  // If running inside an iframe, do nothing
  const inIframe = window.self !== window.top;
  if (inIframe) return;

  // Robust script detection (WordPress-safe)
  const scriptEl =
    document.currentScript ||
    Array.from(document.scripts).find((s) => {
      const src = s.getAttribute("src") || "";
      return src.includes("/widget/script");
    }) ||
    Array.from(document.scripts).slice(-1)[0];

  const getAttr = (name, fallback = "") => {
    const v = scriptEl && scriptEl.getAttribute
      ? scriptEl.getAttribute(name)
      : null;
    return (v ?? fallback).trim();
  };

  const site = getAttr("data-site", "default");
  const label = getAttr("data-label", "See live");
  const theme = getAttr("data-theme", "burgundy").toLowerCase();
  const author = getAttr("data-author", "the author");
  const learnMore = getAttr("data-learn-more", "https://convergo.live");

  // Auto-open (force only)
  const autoOpen =
    (getAttr("data-auto-open") === "true" ||
      getAttr("data-auto-open") === "1") &&
    getAttr("data-auto-open-mode") === "force";

  // Determine Convergo origin
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
    if (theme === "burgundy") {
      return { bg: "#6b0f2e", fg: "#ffffff" };
    }
    if (theme === "mint") {
      return { bg: "#1bbf82", fg: "#0b2b1f" };
    }
    return { bg: "#6b0f2e", fg: "#ffffff" };
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
        box-shadow:0 10px 30px rgba(0,0,0,.22);
        cursor:pointer;
      }
      #\${BACKDROP_ID}{
        position:fixed; inset:0; z-index:2147483646;
        background:rgba(15,23,42,.35);
      }
      #\${MODAL_ID}{
        position:fixed; left:50%; top:50%;
        transform:translate(-50%,-50%);
        width:min(900px, calc(100vw - 32px));
        height:min(650px, calc(100vh - 32px));
        background:#fff; color:#0f172a;
        border-radius:18px;
        border:1px solid rgba(15,23,42,.1);
        box-shadow:0 22px 70px rgba(0,0,0,.28);
        display:none; flex-direction:column;
        z-index:2147483647;
      }
      #\${CLOSE_ID}{
        position:absolute; right:14px; top:10px;
        width:40px; height:40px; border-radius:999px;
        background:rgba(15,23,42,.04);
        border:1px solid rgba(15,23,42,.12);
        font-size:22px; cursor:pointer;
      }
      #\${IFRAME_ID}{
        width:100%; height:100%; border:0; background:#fff;
      }
      #\${FOOTER_ID}{
        padding:10px; font-size:12px;
        border-top:1px solid rgba(15,23,42,.1);
        text-align:center; color:rgba(15,23,42,.65);
      }
    \`;
    document.head.appendChild(style);
  }

  function ensureUI() {
    ensureStyles();

    if (!el(BTN_ID)) {
      const btn = document.createElement("button");
      btn.id = BTN_ID;
      btn.textContent = label;
      btn.setAttribute(ACTION_ATTR, ACTION_OPEN);
      document.body.appendChild(btn);
    }

    if (!el(BACKDROP_ID)) {
      const bd = document.createElement("div");
      bd.id = BACKDROP_ID;
      bd.style.display = "none";
      bd.setAttribute(ACTION_ATTR, ACTION_CLOSE);
      document.body.appendChild(bd);
    }

    if (!el(MODAL_ID)) {
      const modal = document.createElement("div");
      modal.id = MODAL_ID;

      const close = document.createElement("button");
      close.id = CLOSE_ID;
      close.innerHTML = "&times;";
      close.setAttribute(ACTION_ATTR, ACTION_CLOSE);

      const iframe = document.createElement("iframe");
      iframe.id = IFRAME_ID;
      iframe.loading = "lazy";

      // ✅ Embed URL with cache-busting
      const embedUrl = new URL(\`\${convergoOrigin}/embed\`);
      embedUrl.searchParams.set("site", site);
      embedUrl.searchParams.set("author", author);
      embedUrl.searchParams.set("learnMore", learnMore);

      try {
        const v = scriptSrc ? new URL(scriptSrc).searchParams.get("v") : null;
        embedUrl.searchParams.set("v", v || String(Date.now()));
      } catch {
        embedUrl.searchParams.set("v", String(Date.now()));
      }

      iframe.src = embedUrl.toString();

      const footer = document.createElement("div");
      footer.id = FOOTER_ID;
      footer.textContent = "Powered by ConVergo & ChatGPT";

      modal.append(close, iframe, footer);
      document.body.appendChild(modal);
    }

    bindListeners();
  }

  function bindListeners() {
    if (listenersBound) return;
    listenersBound = true;

    document.addEventListener("click", (e) => {
      const t = e.target?.closest?.(\`[\${ACTION_ATTR}]\`);
      if (!t) return;
      t.getAttribute(ACTION_ATTR) === ACTION_OPEN ? openModal() : closeModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) closeModal();
    });
  }

  function openModal() {
    const m = el(MODAL_ID);
    const b = el(BACKDROP_ID);
    const btn = el(BTN_ID);
    if (!m || isOpen) return;
    b.style.display = "block";
    m.style.display = "flex";
    btn.style.display = "none";
    lockScroll();
    isOpen = true;
  }

  function closeModal() {
    const m = el(MODAL_ID);
    const b = el(BACKDROP_ID);
    const btn = el(BTN_ID);
    if (!m) return;
    b.style.display = "none";
    m.style.display = "none";
    btn.style.display = "";
    unlockScroll();
    isOpen = false;
  }

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
