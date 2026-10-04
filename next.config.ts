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

  // A self-contained server in `.next/standalone` — what `Dockerfile.web`
  // ships to ECS Fargate. It carries only the node_modules the server actually
  // imports, so the image is a few hundred MB instead of the whole tree.
  output: "standalone",

  /**
   * Development only, and it fixes a specific dead page.
   *
   * On a first visit with no Clerk dev-browser cookie, Clerk bounces the
   * browser through `<instance>.clerk.accounts.dev/v1/client/handshake` and
   * back. Chromium then attaches `Origin: https://<instance>.clerk.accounts.dev`
   * to the module scripts the returned page requests, and Next's dev server
   * refuses a cross-origin asset request with a bodiless 403.
   *
   * Seven chunks died that way — `@clerk/nextjs` and this app's own `src/lib`
   * among them — so React never hydrated and every client component on the
   * page was inert: no theme toggle, no language switch, no taluka list. The
   * page looked completely fine, because the server-rendered HTML is fine. It
   * is only the JavaScript that never arrives.
   *
   *   curl -o /dev/null -w '%{http_code}' \
   *     -H 'Origin: https://<instance>.clerk.accounts.dev' \
   *     http://127.0.0.1:3000/_next/static/chunks/<any>.js     # -> 403
   *
   * Production is unaffected: there is no handshake redirect on a configured
   * production instance, and this option is read only by `next dev`.
   *
   * ⚠ The exact hostname is what works. `"*.clerk.accounts.dev"` alone was
   * tried first and the chunks still came back 403 — the wildcard is not
   * honoured here. It is kept below only as documentation of intent.
   *
   * That makes this line instance-specific: the subdomain is *this* Clerk
   * development instance. A teammate with their own instance, or a rotated
   * key, gets a different one and will see the same dead page — no theme
   * toggle, no language switch, no taluka list — with no error to go on. The
   * fix is to read their own handshake URL out of the browser's network tab
   * and add it here.
   */
  allowedDevOrigins: [
    "stirred-lark-72.clerk.accounts.dev",
    "*.clerk.accounts.dev", // does not match; see above
    "127.0.0.1",
    "localhost",
  ],

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
