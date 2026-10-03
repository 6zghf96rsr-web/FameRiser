import {boardRequest} from '@/lib/rankme/board-page';
import Board from "@/components/rankme/board";
import { getBoardPage } from "@/lib/rankme/data";
import { boardFilters } from "@/lib/rankme/leaderboards";
export const metadata = { title: "Most Famous — FameRiser" };
export const dynamic = "force-dynamic";
export default async function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query=await searchParams;
  const b = await getBoardPage(boardRequest(query));
  return <Board initialProfiles={b.profiles} {...b} {...boardFilters(query)} />;
}
