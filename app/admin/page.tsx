import { redirect } from "next/navigation";
import { getBoard } from "@/lib/rankme/data";
import { getUser, adminDB } from "@/lib/supabase/server";
import { PageShell } from "@/components/rankme/shell";
import { Admin } from "@/components/rankme/admin";
import { DemoAccess } from "@/components/rankme/demo-access";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const b = await getBoard();
  if (!b.demo) {
    const u = await getUser();
    if (!u) redirect("/login");
    const { data } = await adminDB()
      .from("users")
      .select("role,banned")
      .eq("id", u.id)
      .single();
    if (data?.role !== "admin" || data.banned)
      return (
        <PageShell title="Sem má přístup jen správce.">
          <div className="notice">
            Tvůj účet nemá administrátorské oprávnění.
          </div>
        </PageShell>
      );
  }
  return (
    <PageShell
      title="Dobrý žebříček začíná tady."
      eyebrow="ADMINISTRACE"
      name={b.settings.name}
      wide
    >
      {b.demo ? <DemoAccess returnTo="/admin"><Admin {...b} /></DemoAccess> : <Admin {...b} />}
    </PageShell>
  );
}
