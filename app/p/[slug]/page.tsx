import { notFound } from "next/navigation";
import { getProfile } from "@/lib/rankme/data";
import { ProfileDetail } from "@/components/rankme/profile-detail";
import { PageShell } from "@/components/rankme/shell";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await getProfile((await params).slug);
  if (!p) return { title: "Profil nenalezen" };
  const url = `${process.env.APP_URL || ""}/p/${p.profile.slug}`;
  const title = `${p.profile.name} – #${p.profile.rank} na ${p.settings.name}`;
  return {
    title,
    description: p.profile.bio,
    alternates: { canonical: url },
    robots: p.demo ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description: p.profile.bio,
      url,
      ...(p.profile.avatar_url
        ? { images: [{ url: p.profile.avatar_url }] }
        : { images: [] }),
    },
    twitter: {
      card: "summary" as const,
      title,
      description: p.profile.bio,
      images: p.profile.avatar_url ? [p.profile.avatar_url] : [],
    },
  };
}
export default async function Detail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const b = await getProfile((await params).slug);
  if (!b) notFound();
  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: b.profile.name,
    description: b.profile.bio,
    url: `${process.env.APP_URL || ""}/p/${b.profile.slug}`,
    ...(!b.demo ? { sameAs: [b.profile.social_url] } : {}),
  };
  return (
    <PageShell
      title="Profil v centru dění."
      name={b.settings.name}
      eyebrow={b.demo ? "FIKTIVNÍ DEMO PROFIL" : "VEŘEJNÝ PROFIL"}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />
      <ProfileDetail {...b} />
    </PageShell>
  );
}
