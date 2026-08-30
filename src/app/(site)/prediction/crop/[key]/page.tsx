import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CROPS } from "@/data/crops";
import { CROP_KEYS, isCropKey } from "@/data/topics";
import { CropDetail } from "@/components/site/detail/CropDetail";

/**
 * A page per crop the model can name — all 22, not the five the worked
 * example happened to contain.
 *
 * That was the bug. `generateStaticParams` used to read `predictedCropKeys()`
 * from `src/data/prediction.ts`, which is the hand-written demonstration. With
 * `dynamicParams = false` every other crop 404'd, so a farmer whose card came
 * back `mothbeans` tapped their own top recommendation and got a not-found
 * page. Verified against a real prediction: four of its five crops had no page.
 *
 * `dynamicParams = false` stays. The model's vocabulary is finite and known,
 * so a key outside it is a genuine 404 rather than a page rendered about
 * nothing.
 *
 * Thin by design — resolve the param, then hand off to a client body, because
 * every surface on this site renders bilingually through `useLang()`.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return CROP_KEYS.map((key) => ({ key }));
}

export async function generateMetadata({
  params,
}: PageProps<"/prediction/crop/[key]">): Promise<Metadata> {
  const { key } = await params;
  const crop = CROPS.find((c) => c.key === key);
  if (!crop) return {};
  return {
    title: `${crop.mr} · ${crop.en}`,
    description: `${crop.en} — when it is sown in India, where it is grown, what it needs, and what to feed it.`,
  };
}

export default async function Page({
  params,
}: PageProps<"/prediction/crop/[key]">) {
  const { key } = await params;
  if (!isCropKey(key)) notFound();

  return <CropDetail cropKey={key} />;
}
