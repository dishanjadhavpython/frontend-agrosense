import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SOILS } from "@/data/soils";
import { SOIL_KEYS, isSoilKey } from "@/data/topics";
import { SoilDetail } from "@/components/site/detail/SoilDetail";

/**
 * A page per soil class the image classifier can return — all 8.
 *
 * One existed before: laterite, because that is what the worked example
 * predicts. A farmer photographing black soil got a 404 on the answer the
 * classifier had just given them with 90% confidence.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return SOIL_KEYS.map((key) => ({ key }));
}

export async function generateMetadata({
  params,
}: PageProps<"/prediction/soil/[key]">): Promise<Metadata> {
  const { key } = await params;
  const soil = SOILS.find((s) => s.key === key);
  if (!soil) return {};
  return {
    title: `${soil.mr} · ${soil.en}`,
    description: `${soil.en} — how it behaves, what grows well in it, and what struggles.`,
  };
}

export default async function Page({
  params,
}: PageProps<"/prediction/soil/[key]">) {
  const { key } = await params;
  if (!isSoilKey(key)) notFound();

  return <SoilDetail soilKey={key} />;
}
