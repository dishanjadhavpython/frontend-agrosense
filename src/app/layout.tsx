import type { Metadata, Viewport } from "next";
import {
  Anek_Devanagari,
  Mukta,
  IBM_Plex_Mono,
  Tiro_Devanagari_Marathi,
} from "next/font/google";
import { LanguageProvider } from "@/lib/i18n";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

/**
 * Four faces, four jobs. See PLAN.md §3.
 *
 * Anek carries the display register in both scripts — its width axis is the
 * reason one family can set the quiet headline and the rare loud one without
 * dragging in a second Devanagari face.
 */
const anek = Anek_Devanagari({
  subsets: ["devanagari", "latin"],
  axes: ["wdth"],
  variable: "--font-anek",
  display: "swap",
});

const mukta = Mukta({
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mukta",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

/** Only the report surface and pull-quotes. It should read as printed paper. */
const tiro = Tiro_Devanagari_Marathi({
  subsets: ["devanagari", "latin"],
  weight: "400",
  variable: "--font-tiro",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "अ‍ॅग्रोसेन्स — तुमच्या मातीला काय हवंय, ते आम्ही सांगू",
    template: "%s · अ‍ॅग्रोसेन्स",
  },
  description:
    "माती आरोग्य पत्रिका द्या. पीक, खत आणि भावाचा सल्ला मिळवा. — Share your Soil Health Card and get crop, fertilizer and mandi price advice in plain Marathi.",
};

export const viewport: Viewport = {
  // The browser chrome follows the app. This pair is the best first guess
  // before hydration; `useTheme` corrects it to the actual chosen theme,
  // which can differ from the OS setting.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f0b" },
  ],
  // This audience zooms. Never lock that away.
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="mr"
      // The head script writes data-theme onto this element before React
      // exists, so the live DOM legitimately carries an attribute the server
      // never rendered. Suppression applies to this element only — it does
      // not extend into the tree, so real mismatches below still surface.
      suppressHydrationWarning
      className={`${anek.variable} ${mukta.variable} ${plexMono.variable} ${tiro.variable} h-full antialiased`}
    >
      <head>
        {/* Sets data-theme before the first paint. Without it, someone who
            chose dark gets a full white page for a frame — which at night is
            the single most unpleasant thing a website can do. It has to be
            inline and it has to be first. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />

        {/* Animated sections start at opacity 0 and are revealed by script.
            On a dropped connection that would be a blank page, so without JS
            they simply render in place. */}
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-full flex flex-col">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
