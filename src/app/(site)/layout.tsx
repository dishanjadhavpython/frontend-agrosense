import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { CardProvider } from "@/lib/cardState";
import { ChatAssistant } from "@/components/site/ChatAssistant";
import { ViewSwitch } from "@/components/examiner/ViewSwitch";

/**
 * Public chrome. Nested under the root layout rather than being a second root
 * layout — two roots would force a full page reload on every crossing into the
 * app, and sign-in crosses constantly (research and plan/PLAN.md §9).
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* The padding has to be repeated under `focus:` — `not-sr-only` sets
          padding to 0 as part of undoing `sr-only`, so the unprefixed px-6/py-4
          were being wiped and the link appeared as a cramped 26px pill. */}
      <a
        href="#main"
        className="sr-only rounded-full bg-ink text-paper focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-100 focus:px-6 focus:py-4"
      >
        मुख्य मजकुराकडे जा
      </a>
      <SiteHeader />
      {/* Upload and "the card, read" are far apart in the document and must
          be describing the same card. The result lives above both. */}
      <CardProvider>
        <main id="main" className="flex-1">
          {children}
        </main>
        {/* Inside the provider on purpose: the assistant answers about the
            card this page has read, so it has to see the same card. */}
        <ChatAssistant />
      </CardProvider>
      <SiteFooter />
      {/* The way across to the examiner walkthrough. The only thing this
          section knows about it. */}
      <ViewSwitch />
    </>
  );
}
