import type { NextConfig } from "next";

/**
 * The headers CSP does not cover.
 *
 * `Content-Security-Policy` is generated per request by `clerkMiddleware` in
 * `src/middleware.ts` — it needs a nonce and it needs Clerk's own origins, and
 * neither can be written statically here. Everything below is the rest of the
 * response-header surface, which is static and therefore belongs in config.
 *
 * Each is here because of a specific attack, not as a checklist:
 *
 *   HSTS                  a farmer on a village wifi typing the domain without
 *                         https:// must not make one cleartext round trip that
 *                         carries a session cookie.
 *   nosniff               an uploaded card is served back by the API; without
 *                         this a browser may decide a .pdf is HTML and run it.
 *   Referrer-Policy       document ids appear in paths. They must not leak to
 *                         a third-party site in a Referer header.
 *   Permissions-Policy    camera stays enabled for `self` because the upload
 *                         needs `enumerateDevices` to decide whether to offer
 *                         the shutter; everything else is denied outright,
 *                         including to embedded frames.
 *   X-Frame-Options       superseded by frame-ancestors, kept for older
 *                         browsers that do not honour the CSP directive.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=(self)",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // Nginx and CloudFront both advertise their own; ours adds nothing but a
  // version number for somebody scanning.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
