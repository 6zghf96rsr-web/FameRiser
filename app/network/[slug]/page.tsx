import {boardRequest} from '@/lib/rankme/board-page';
import { notFound } from "next/navigation";
import Board from "@/components/rankme/board";
import { getBoardPage } from "@/lib/rankme/data";
import { boardFilters, leaderboardPath, networkFromSlug } from "@/lib/rankme/leaderboards";

export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const platform = networkFromSlug((await params).slug);
  if (!platform) notFound();
  return {
    title: `${platform} Fame — FameRiser`,
    description: `Žebříček profilů na síti ${platform} podle zaplacené částky. Každý profil je také součástí žebříčku Most Famous.`,
    alternates: { canonical: `${process.env.APP_URL || ""}${leaderboardPath(platform)}` },
  };
}

export default async function Network({ params, searchParams }: Props) {
  const platform = networkFromSlug((await params).slug);
  if (!platform) notFound();
  const query=await searchParams;
  const b = await getBoardPage(boardRequest(query,platform));
  return <Board key={platform} initialProfiles={b.profiles} {...b}
    initialPlatform={platform} {...boardFilters(query)} />;
}
