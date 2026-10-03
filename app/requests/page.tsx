import {PageShell} from '@/components/rankme/shell';
import {ServiceRequests} from '@/components/rankme/service-requests';
import {demoEnabled} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export default function Requests(){return <PageShell title="Žádosti, přezkum a odstoupení" eyebrow="PODPORA"><ServiceRequests demo={demoEnabled()}/></PageShell>}
