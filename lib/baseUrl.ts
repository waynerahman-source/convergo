// lib/baseUrl.ts
export function getBaseUrl() {
  // In the browser, relative URLs are fine
  if (typeof window !== "undefined") {
    return "";
  }

  // On Vercel, this is set to e.g. convergo-xxxxx.vercel.app
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Local dev fallback
  return "http://localhost:3000";
}
