import {PageShell} from '@/components/rankme/shell';
import {Acceptance} from '@/components/rankme/service-requests';
import {redirect} from 'next/navigation';
import {demoEnabled, getUser} from '@/lib/supabase/server';
import {authReturnPath} from '@/lib/rankme/connections';
export const dynamic = 'force-dynamic';
export default async function Consent({searchParams}: {searchParams?: Promise<Record<string,string>>} = {}){
  if (!demoEnabled() && !(await getUser())) redirect('/login?error=session&next='+encodeURIComponent(authReturnPath((await searchParams)?.next??null)));
  return <PageShell title="Podmínky účtu"><Acceptance/></PageShell>;
}
