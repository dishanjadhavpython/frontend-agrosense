import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "नोंदणी करा · Create account",
  description: "Create an account to read your Soil Health Card.",
};

export default function Page() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-5 py-14 md:py-20">
      <h1 className="section-head text-center text-ink">नोंदणी करा</h1>
      <p className="mt-3 max-w-sm text-center text-[15px] leading-relaxed text-ink-soft">
        One account, so your cards stay yours. Reading crop, soil and
        fertilizer pages needs no account at all.
      </p>
      <div className="mt-9">
        <SignUp />
      </div>
    </div>
  );
}
