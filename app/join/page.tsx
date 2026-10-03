import { getBoard } from "@/lib/rankme/data";
import { getUser, adminDB } from "@/lib/supabase/server";
import { JoinForm } from "@/components/rankme/join-form";
import { PageShell } from "@/components/rankme/shell";
import { Profile } from "@/lib/rankme/config";
import { networkFromSlug } from "@/lib/rankme/leaderboards";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { instagramDB } from "@/db";
import { getInstagram } from "@/lib/rankme/instagram-store";
import type { SavedInstagram } from "@/lib/rankme/instagram";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function Join({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const b = await getBoard();
  const q = await searchParams;
  // Starting a new profile always goes through the single verified-account chooser.
  if (!q.profile && !q.connection && !q.instagram) redirect('/connections?add=1');
  if (!b.demo && (q.profile || q.connection)) {
    const kind=q.profile?'profile':'connection';
    const id=z.string().uuid().safeParse(q[kind]);
    if(!id.success)notFound();
    if(!(await getUser()))redirect('/login?next='+encodeURIComponent(`/join?${kind}=${id.data}`));
  }
  let existing: Profile | undefined;
  let instagram: SavedInstagram | undefined;
  if (q.instagram) {
    const parsed = z.string().uuid().safeParse(q.instagram);
    if (!parsed.success || q.profile || q.connection) notFound();
    const returnTo = `/join?instagram=${parsed.data}`;
    const viewer = await requireChatGPTUser(returnTo);
    const saved = await getInstagram(instagramDB(), viewer.userId, parsed.data);
    if (!saved) notFound();
    if (!b.demo) {
      const account = await getUser();
      if (!account) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
      const previous = await adminDB().from("profiles").select("id,status")
        .eq("user_id", account.id).eq("social_url", saved.social_url)
        .neq("status", "deleted").maybeSingle();
      if (previous.error) throw new Error("Profil se nepodařilo načíst. Zkus to znovu.");
      if (previous.data) {
        redirect(["active", "pending_payment"].includes(previous.data.status)
          ? `/join?profile=${previous.data.id}` : "/dashboard");
      }
    }
    instagram = saved;
  }
  if (q.profile && !b.demo) {
    const u = await getUser();
    if (u) {
      const { data } = await adminDB()
        .from("profiles")
        .select("*,social_platforms(name),categories(name)")
        .eq("id", q.profile)
        .eq("user_id", u.id)
        .single();
      if (data)
        existing = {
          ...data,
          platform: data.social_platforms.name,
          category: data.categories.name,
          today_paid: b.profiles.find((p) => p.id === data.id)?.today_paid || 0,
          views: 0,
          clicks: 0,
        };
    }
  }
  return (
    <PageShell
      title={existing ? "Posuň se o kus výš." : "Tvoje cesta nahoru."}
      eyebrow="BUĎ VIDĚT"
      description="Jeden profil. Pár kroků. Tvoje místo v žebříčku."
      name={b.settings.name}
    >
      <section className="form-card">
        <JoinForm
          profiles={b.profiles}
          settings={b.settings}
          demo={b.demo}
          initialAmount={Number(q.amount) || undefined}
          existing={existing}
          instagram={instagram}
          period={q.period === "today" ? "today" : "all"}
          initialPlatform={typeof q.network === "string" ? networkFromSlug(q.network) : undefined}
        />
      </section>
    </PageShell>
  );
}
