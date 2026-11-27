import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  logging: { incomingRequests: false },
  async headers() {
    return [
      {
        source: "/results/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'", "base-uri 'self'", "object-src 'none'",
              "frame-ancestors 'none'", "form-action 'self'", "font-src 'self' data:",
              "img-src 'self' data: blob: https:" + (process.env.APP_ENV === "development" ? " http://127.0.0.1:25421" : ""),
              "style-src 'self' 'unsafe-inline'",
              "worker-src 'self' blob:",
              "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
            ].join("; "),
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
