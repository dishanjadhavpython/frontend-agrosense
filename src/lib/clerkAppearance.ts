import type { ClerkProvider } from "@clerk/nextjs";
import type { ComponentProps } from "react";

/** Taken from the package we actually depend on. `@clerk/types` is a
 *  transitive dependency and importing it directly breaks a clean `npm ci`. */
type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

/**
 * Clerk, wearing this product's clothes.
 *
 * Left alone, Clerk renders in its own purple with its own type — which on a
 * page set in Anek Devanagari over paper-white reads as a third-party widget
 * bolted on. This is the screen where a farmer decides whether to trust the
 * thing with a photograph of their land record, so it should not look like it
 * belongs to somebody else.
 *
 * Every value is a CSS variable already defined in `globals.css`, so the
 * sign-in box follows the theme toggle for free — including into the dark
 * theme, which Clerk would otherwise render as a white card on a black page.
 *
 * The variable names here are Clerk 7's (`colorForeground`, `colorInput`), not
 * the `colorText`/`colorInputBackground` pair that older guides and most of the
 * search results still show. Those are silently ignored rather than rejected at
 * runtime, so the failure mode is an unstyled box, not an error.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "var(--color-ink)",
    colorPrimaryForeground: "var(--color-paper)",
    colorBackground: "var(--color-surface)",
    colorForeground: "var(--color-ink)",
    colorMutedForeground: "var(--color-ink-mute)",
    colorInput: "var(--color-paper)",
    colorInputForeground: "var(--color-ink)",
    colorBorder: "var(--color-line)",
    colorDanger: "var(--color-anar)",
    colorSuccess: "var(--color-leaf)",
    colorWarning: "var(--color-haldi)",
    fontFamily: "var(--font-mukta), system-ui, sans-serif",
    fontFamilyButtons: "var(--font-mukta), system-ui, sans-serif",
    borderRadius: "var(--radius-card)",
  },
  elements: {
    // Clerk's card carries its own shadow and border; this product has one of
    // each, and they are tokens.
    card: "shadow-[var(--shadow-card)] border border-line",
    headerTitle: "font-[family-name:var(--font-display)]",
    // 48px minimum, the floor every other control on this site clears —
    // outdoors, one-handed, often on a cracked screen.
    formButtonPrimary:
      "min-h-12 normal-case text-[15px] font-semibold hover:bg-leaf-deep",
    formFieldInput: "min-h-12",
    footerActionLink: "text-leaf hover:text-leaf-deep",
  },
};
