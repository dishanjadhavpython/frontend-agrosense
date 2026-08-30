import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FERTILIZERS } from "@/data/fertilizers";
import { FERTILIZER_KEYS, isFertilizerKey } from "@/data/topics";
import { FertDetail } from "@/components/site/detail/FertDetail";

/**
 * A page per blend the fertilizer model can return — all 7.
 *
 * Four existed before, from the worked example. `28-28` was not among them,
 * and it is what a real prediction returned as the second bag worth buying.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return FERTILIZER_KEYS.map((key) => ({ key }));
}

export async function generateMetadata({
  params,
}: PageProps<"/prediction/fertilizer/[key]">): Promise<Metadata> {
  const { key } = await params;
  const fert = FERTILIZERS.find((f) => f.key === key);
  if (!fert) return {};
  return {
    title: `${fert.mr} · ${fert.name}`,
    description: `${fert.name} (${fert.npk.join("-")}) — what is in the bag, and whether your soil needs it.`,
  };
}

export default async function Page({
  params,
}: PageProps<"/prediction/fertilizer/[key]">) {
  const { key } = await params;
  if (!isFertilizerKey(key)) notFound();

  return <FertDetail fertKey={key} />;
}
