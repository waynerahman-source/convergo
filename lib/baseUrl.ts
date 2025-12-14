// lib/baseUrl.ts

type HeadersLike = {
  get(name: string): string | null;
};

export function getBaseUrl(headers?: HeadersLike) {
  // Browser: relative URLs are best
  if (typeof window !== "undefined") return "";

  // If we're on a request (App Router), prefer forwarded headers
  // so we correctly reflect custom domains + proxies.
  const proto =
    headers?.get("x-forwarded-proto") ||
    process.env.VERCEL_ENV ? "https" : "http";

  const host =
    headers?.get("x-forwarded-host") ||
    headers?.get("host") ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, "") ||
    "localhost:3000";

  // If host already includes protocol, return as-is
  if (host.startsWith("http://") || host.startsWith("https://")) return host;

  return `${proto}://${host}`;
}
