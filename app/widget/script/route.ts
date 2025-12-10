// app/widget/script/route.ts
import type { NextRequest } from "next/server";

const WIDGET_JS = `(() => {
  function init() {
    // Avoid duplicating the button if script loads twice
    if (document.getElementById("convergo-widget-button")) return;

    const btn = document.createElement("button");
    btn.id = "convergo-widget-button";
    btn.innerText = "ConVergo Live";

    Object.assign(btn.style, {
      position: "fixed",
      bottom: "1.5rem",
      right: "1.5rem",
      zIndex: "999999",
      borderRadius: "9999px",
      padding: "0.75rem 1.25rem",
      border: "none",
      cursor: "pointer",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: "14px",
      fontWeight: "600",
      color: "#0f172a",
      background: "linear-gradient(135deg, #2dd4bf, #22c55e)",
      boxShadow: "0 10px 25px rgba(15, 23, 42, 0.35)",
    });

    btn.addEventListener("mouseenter", () => {
      btn.style.transform = "translateY(-1px)";
      btn.style.boxShadow = "0 14px 30px rgba(15, 23, 42, 0.45)";
    });

    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "translateY(0)";
      btn.style.boxShadow = "0 10px 25px rgba(15, 23, 42, 0.35)";
    });

    btn.addEventListener("click", () => {
      // For now just log; later we’ll open the full widget panel
      console.log("[ConVergo] Widget button clicked on", window.location.href);
      alert("ConVergo widget is wired in and live. Next step: open the full panel here.");
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();`;

export async function GET(_req: NextRequest) {
  return new Response(WIDGET_JS, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
