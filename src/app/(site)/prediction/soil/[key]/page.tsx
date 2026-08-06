import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SOILS } from "@/data/soils";
import { PREDICTED_SOIL, predictedSoilKeys } from "@/data/prediction";
import { SoilDetail } from "@/components/site/detail/SoilDetail";

/** The classified soil. One page, because the classifier returns one answer. */

export const dynamicParams = false;

export function generateStaticParams() {
  return predictedSoilKeys().map((key) => ({ key }));
}

export async function generateMetadata({
  params,
}: PageProps<"/prediction/soil/[key]">): Promise<Metadata> {
  const { key } = await params;
  const soil = SOILS.find((s) => s.key === key);
  if (!soil) return {};
  return {
    title: `${soil.mr} · ${soil.en}`,
    description: `${soil.en} — what the classifier saw, and what grows in it.`,
  };
}

export default async function Page({
  params,
}: PageProps<"/prediction/soil/[key]">) {
  const { key } = await params;
  if (key !== PREDICTED_SOIL.key) notFound();

  return <SoilDetail pick={PREDICTED_SOIL} />;
}
