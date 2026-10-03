import { redirect } from "next/navigation";
import { getBoard } from "@/lib/rankme/data";
import { getUser } from "@/lib/supabase/server";
import { PageShell } from "@/components/rankme/shell";
import { CreatorInsights } from "@/components/rankme/creator-insights";
import { Dashboard } from "@/components/rankme/dashboard";
import { DemoDashboardAccess } from "@/components/rankme/demo-access";
export const dynamic = "force-dynamic";
export default async function Account() {
  const b = await getBoard();
  if (!b.demo && !(await getUser())) redirect("/login");
  return (
    <PageShell
      title="Tvoje místo. Pod kontrolou."
      eyebrow="MŮJ ÚČET"
      name={b.settings.name}
      wide
    >
      {b.demo ? <><DemoDashboardAccess /><CreatorInsights demo profiles={b.profiles.slice(0,2)}/></> : <Dashboard {...b} />}
    </PageShell>
  );
}
