import { InstagramAccess } from "@/components/rankme/instagram-access";
import { PageShell } from "@/components/rankme/shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Můj Instagram · FameRiser", robots: { index: false, follow: false } };

export default function InstagramPage() {
  return <PageShell eyebrow="MOJE SOCIÁLNÍ SÍTĚ" title="Můj Instagram." description="Připrav si soukromý návrh. Účet bude propojený až po ověření." wide><InstagramAccess /></PageShell>;
}
