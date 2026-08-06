import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FERTILIZERS } from "@/data/fertilizers";
import { findFertPrediction, predictedFertKeys } from "@/data/prediction";
import { FertDetail } from "@/components/site/detail/FertDetail";

/**
 * A page per bag the recommender named — including the ones it named in order
 * to say don't buy them. A "hold" needs a page more than an "apply" does: the
 * reason not to spend money is the part that has to be argued.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return predictedFertKeys().map((key) => ({ key }));
}

export async function generateMetadata({
  params,
}: PageProps<"/prediction/fertilizer/[key]">): Promise<Metadata> {
  const { key } = await params;
  const fert = FERTILIZERS.find((f) => f.key === key);
  if (!fert) return {};
  return {
    title: `${fert.mr} · ${fert.name}`,
    description: `${fert.name} (${fert.npk.join("-")}) — whether your field needs it, and how much.`,
  };
}

export default async function Page({
  params,
}: PageProps<"/prediction/fertilizer/[key]">) {
  const { key } = await params;
  const pick = findFertPrediction(key);
  if (!pick) notFound();

  return <FertDetail pick={pick} />;
}
