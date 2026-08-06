import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CROPS } from "@/data/crops";
import { findCropPrediction, predictedCropKeys } from "@/data/prediction";
import { CropDetail } from "@/components/site/detail/CropDetail";

/**
 * A page per recommended crop.
 *
 * Nested under /prediction rather than living at /crops on purpose: only the
 * crops this run actually returned have a page, and the path is what explains
 * why mango doesn't. `dynamicParams = false` makes that a 404 rather than a
 * page that renders empty.
 *
 * Thin by design — resolve the param, then hand off to a client body, because
 * every surface on this site renders bilingually through `useLang()`.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return predictedCropKeys().map((key) => ({ key }));
}

export async function generateMetadata({
  params,
}: PageProps<"/prediction/crop/[key]">): Promise<Metadata> {
  const { key } = await params;
  const crop = CROPS.find((c) => c.key === key);
  if (!crop) return {};
  return {
    title: `${crop.mr} · ${crop.en}`,
    description: `${crop.en} — why it suits your soil, what it needs, and what to feed it.`,
  };
}

export default async function Page({
  params,
}: PageProps<"/prediction/crop/[key]">) {
  const { key } = await params;
  const pick = findCropPrediction(key);
  if (!pick) notFound();

  return <CropDetail pick={pick} />;
}
