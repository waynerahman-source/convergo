// app/widget/script/route.ts

export async function GET() {
  const js = `"use strict";
(function () {
  async function fetchConvergoFeed() {
    try {
      var el = document.getElementById("convergo-feed");
      if (!el) return;

      const res = await fetch("/api/feed");
      const data = await res.json();

      el.innerHTML = data.data
        .map(function (cu) {
          var who = cu.speaker === "H" ? "Human" : "AI";
          return (
            '<div style="padding:8px 0;border-bottom:1px solid #222;color:#eee;font-family:system-ui, -apple-system, BlinkMacSystemFont, sans-serif;">' +
              '<div style="font-size:11px;opacity:0.7;margin-bottom:2px;">' +
                who +
                " · #" +
                cu.meta.sequence +
              "</div>" +
              '<div style="font-size:13px;line-height:1.4;">' +
                cu.text +
              "</div>" +
            "</div>"
          );
        })
        .join("");

      var badge = document.getElementById("convergo-badge");
      if (badge) {
        badge.innerHTML =
          'Powered by <strong>ConVergo™</strong> &amp; ChatGPT';
      }
    } catch (e) {
      console.error("ConVergo widget error", e);
    }
  }

  // initial load + refresh every 5s
  fetchConvergoFeed();
  setInterval(fetchConvergoFeed, 5000);
})();`;

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}
