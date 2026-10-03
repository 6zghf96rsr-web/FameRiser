import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { authStatus } from "@/lib/rankme/auth-status";
import { Connections } from "@/components/rankme/connections";
import { PageShell } from "@/components/rankme/shell";
export const dynamic = "force-dynamic";
export default async function ConnectedAccounts({searchParams}: {searchParams:Promise<Record<string,string>>}) {
  const status = await authStatus();
  const query=await searchParams;
  if (status.ready && !(await getUser())) redirect('/login?next='+encodeURIComponent(query.add==='1'?'/connections?welcome=1':'/connections'));
  return (
    <PageShell
      eyebrow="MOJE SOCIÁLNÍ SÍTĚ"
      title="Propojené účty."
      description="Tvoje sociální profily na jednom místě."
      wide
    >
      <Connections status={status} />
    </PageShell>
  );
}
