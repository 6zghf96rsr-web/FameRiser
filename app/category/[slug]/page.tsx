import {boardRequest} from '@/lib/rankme/board-page';
import {boardFilters} from '@/lib/rankme/leaderboards';
import { notFound } from "next/navigation";
import Board from "@/components/rankme/board";
import { getBoardPage } from "@/lib/rankme/data";
import { categoryLabel } from "@/lib/rankme/discovery";
import { categories } from "@/lib/rankme/config";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = categories.find(c => c.toLowerCase() === slug);
  if (!category) notFound();
  return {
    title: `${categoryLabel(category)} — FameRiser`,
    description: `Placený žebříček profilů v kategorii ${categoryLabel(category)}.`,
    alternates: { canonical: `${process.env.APP_URL || ""}/category/${slug}` },
  };
}
export default async function Category({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>; searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const { slug } = await params;
  const category = categories.find((c) => c.toLowerCase() === slug);
  if (!category) notFound();
  const query={...await searchParams,category};
  const b = await getBoardPage(boardRequest(query));
  return (
    <Board initialProfiles={b.profiles} {...b} {...boardFilters(query)} />
  );
}
