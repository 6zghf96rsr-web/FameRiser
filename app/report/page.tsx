import { PageShell } from '@/components/rankme/shell';
import { ReportForm } from '@/components/rankme/report-form';
import { demoEnabled } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Oznámit problém s obsahem — FameRiser', robots: { index: false, follow: false } };
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const query = await searchParams;
  const initialURL = typeof query.url === 'string' ? query.url.slice(0,2000) : '';
  return <PageShell title="Oznámit problém s obsahem" eyebrow="BEZPEČNOST A PRAVIDLA" description="Upozorni nás na nezákonný obsah nebo porušení pravidel. Přesný odkaz a popis nám pomohou oznámení posoudit."><ReportForm initialURL={initialURL} demo={demoEnabled()}/></PageShell>;
}
