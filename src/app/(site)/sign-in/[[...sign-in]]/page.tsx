import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

/**
 * Catch-all, because Clerk routes its own sub-steps (factor-two, reset
 * password, SSO callback) under this path. A plain `page.tsx` here renders the
 * first screen and 404s on every step after it.
 *
 * Inside the `(site)` group so the header, footer and language toggle stay —
 * a farmer who lands here from the Predict button should still be able to get
 * back to the page they came from.
 */

export const metadata: Metadata = {
  title: "लॉग इन करा · Sign in",
  description: "Sign in to read your Soil Health Card.",
};

export default function Page() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-5 py-14 md:py-20">
      <h1 className="section-head text-center text-ink">
        तुमची पत्रिका वाचण्यासाठी लॉग इन करा
      </h1>
      <p className="mt-3 max-w-sm text-center text-[15px] leading-relaxed text-ink-soft">
        Your card and its readings are yours. Signing in is what keeps them
        that way — nobody else can open a card you uploaded.
      </p>
      <div className="mt-9">
        <SignIn />
      </div>
    </div>
  );
}
