import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
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
  // The examiner walkthrough: a chaptered explanation of how this system is
  // built, for a project examiner marking it. Every number on those pages comes
  // from committed modules under `src/data/examiner/`, generated offline from
  // the training artifacts — no card, no document, no paid API call, and the
  // same bytes for every visitor. By the rule at the top of this file it meets
  // neither test for gating.
  "/examiner(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Read-only, identical for every visitor, and the detail pages fetch it
  // client-side while signed out.
  "/api/insights(.*)",
  // The 351-taluka list, the atlas and the season vocabulary. Public for the
  // same three reasons `/api/insights` is: it is read-only, it is identical
  // for every visitor, and the location step fetches it client-side on mount
  // — before anyone has been asked to sign in. It costs no paid API call and
  // carries nobody's document; by the rule stated above it does not meet
  // either test for gating.
  //
  // Note the exact path. `POST /api/recommend` is deliberately NOT public: a
  // recommendation is the result action, the analogue of `/api/predict`, and
  // it can carry the farmer's own card readings in its body.
  "/api/recommend/meta",
  // The load balancer's health check. It carries no data and costs nothing,
  // and a check that had to sign in would mark every healthy task dead.
  "/api/health",
]);

const isApi = createRouteMatcher(["/api(.*)"]);

const clerk = clerkMiddleware(
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
        //
        // Quoted here because Clerk quotes only keywords (`self`, `none`…)
        // and passes everything else through verbatim. An unquoted
        // `sha256-…` is not a hash source at all: the browser discards it as
        // invalid, and the theme script it was meant to allow is blocked.
        "script-src": [`'${THEME_INIT_SCRIPT_HASH}'`],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'self'"],
        "object-src": ["'none'"],
        "form-action": ["'self'"],
      },
    },
  },
);

/**
 * Behind CloudFront, tell Clerk the viewer's real protocol.
 *
 * The hop from CloudFront to the load balancer is plain HTTP, so the load
 * balancer stamps every request `X-Forwarded-Proto: http`, and Clerk builds its
 * sign-in and handshake redirects from that header — `http://` links on an
 * HTTPS-only site. CloudFront adds `CloudFront-Forwarded-Proto` with what the
 * viewer actually used (terraform/modules/edge). Trusting it is safe here: the
 * load balancer forwards nothing that did not come through CloudFront carrying
 * the origin secret. Locally neither header is present and nothing changes.
 */
export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const viewerProto = request.headers.get("cloudfront-forwarded-proto");
  if (viewerProto && viewerProto !== request.headers.get("x-forwarded-proto")) {
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-proto", viewerProto);
    return clerk(new NextRequest(request, { headers }), event);
  }
  return clerk(request, event);
}

export const config = {
  matcher: [
    // Everything except Next internals and static files, plus every API route.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
