// lib/baseUrl.ts
export function getBaseUrl() {
  // Browser can use relative
  if (typeof window !== "undefined") return "";

  // Vercel Preview/Prod
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  // Local dev (server)
  return "http://localhost:3000";
}
