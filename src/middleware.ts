import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { THEME_INIT_SCRIPT_HASH } from "@/lib/themeScript";

/**
 * Who may reach what.
 *
 * This file exists because of a specific hole. `GET /api/documents` returned
 * every Soil Health Card ever uploaded — in full, with the extracted readings
 * — and `/api/predict` accepted any document id from anyone. A Maharashtra
 * card carries a farmer's name, village and survey number. On localhost that
 * is invisible; behind a public address it is a breach, and the fix has two
 * halves: a session on the way in (here) and an owner on every document
 * (`document_service.py`). Neither is sufficient alone.
 *
 * Public by default, protected by exception — the inverse of the usual advice,
 * and deliberate. This is a public landing page for farmers who have never
 * heard of the product; making them create an account to find out what it does
 * would be the end of it. What is gated is the two things that cost real money
 * (OCR, and a prediction that starts agent runs against a paid API key) and the
 * one thing that is somebody's personal document.
 *
 * A route added under `/api/` is protected unless it is named here, so the
 * failure mode of forgetting to update this file is a locked door rather than
 * an open one.
 */

const isPublic = createRouteMatcher([
  "/",
  // Reference pages for all 37 crops, soils and fertilizers. No card data
  // reaches these — they render from committed editorial content plus the
  // research reports, both of which are the same for everybody.
  "/prediction(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Read-only, identical for every visitor, and the detail pages fetch it
  // client-side while signed out.
  "/api/insights(.*)",
]);

const isApi = createRouteMatcher(["/api(.*)"]);

export default clerkMiddleware(
  async (auth, request) => {
    if (isPublic(request)) return;

    // `auth.protect()` answers 404 on an API route — Clerk's default, and sound
    // reasoning for a route whose existence is worth hiding. These are our own
    // first-party endpoints that our own client calls by name, so there is
    // nothing to hide and a 404 only produces a confusing failure: the browser
    // half reads an error body that isn't there and shows nothing at all.
    //
    // A 401 in the shape the route handlers already use lets the page say "your
    // session expired, sign in again", which is the true and useful sentence.
    if (isApi(request)) {
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json(
          {
            error: "unauthorised",
            message: {
              mr: "तुमचं लॉग इन संपलं आहे. पुन्हा लॉग इन करा.",
              en: "Your session has expired. Please sign in again.",
            },
          },
          { status: 401 },
        );
      }
      return;
    }

      // Pages redirect to the sign-in screen, which is what a person expects.
    await auth.protect();
  },
  {
    /**
     * The Content-Security-Policy, generated rather than hand-written.
     *
     * Clerk builds the base policy including its own script, frame and connect
     * origins, which is the part a hand-rolled CSP gets wrong — those hosts
     * change, and a stale allowlist breaks sign-in for everybody with no
     * warning beyond a console message nobody sees.
     *
     * `strict: true` adds `strict-dynamic` and a per-request nonce, so a script
     * injected into the HTML cannot run even if something ever managed to get
     * one in there.
     *
     * The additions below are this app's own outbound calls. Each is here
     * because something breaks without it:
     *   img-src blob:      the soil-photo preview, which is an object URL
     *   connect-src        Open-Meteo, the only third-party fetch on the page
     *   font/style         Google Fonts, loaded by next/font
     * `frame-ancestors 'none'` is the clickjacking defence and replaces the
     * X-Frame-Options header, which CSP supersedes.
     */
    contentSecurityPolicy: {
      strict: true,
      directives: {
        "img-src": ["'self'", "blob:", "data:", "https://img.clerk.com"],
        "connect-src": ["'self'", "https://api.open-meteo.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        // The one inline script this app writes by hand: the theme
        // initialiser in <head>, which must run before first paint. Allowed
        // by hash rather than nonce — see THEME_INIT_SCRIPT_HASH.
        "script-src": [THEME_INIT_SCRIPT_HASH],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
        "form-action": ["'self'"],
      },
    },
  },
);

export const config = {
  matcher: [
    // Everything except Next internals and static files, plus every API route.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
