import {notFound} from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {ReportForm} from '@/components/rankme/report-form';
import {privateCoreEnabled} from '@/lib/core/private-v1';
import '../private.css';

export const dynamic='force-dynamic';
export const metadata={title:'Oznámit obsah — FameRiser',robots:{index:false,follow:false}};
export default async function PrivateReport({searchParams}:{searchParams:Promise<{url?:string}>}){
  if(!privateCoreEnabled())notFound();
  const query=await searchParams;
  const initialURL=typeof query.url==='string'?query.url.slice(0,2000):'';
  return <main className="private-core"><header className="private-header"><Link className="private-brand" href="/private"><Image src="/brand/fameriser-fr-icon.png" width={40} height={40} alt=""/> FameRiser</Link><span>Soukromý pilot</span></header><div className="private-inner private-rules"><p className="private-eyebrow">BEZPEČNOST A PRAVIDLA</p><h1>Oznámit problém s obsahem</h1><p>Oznámení můžeš podat bez přihlášení. Přesný odkaz a popis nám umožní obsah posoudit. Potvrzení si můžeš stáhnout i v případě, že odchozí zpráva ještě čeká na doručení.</p><ReportForm initialURL={initialURL} demo={false} privacyHref="/private/rules"/><p><Link href="/private/rules">Pravidla a ochrana údajů</Link></p></div></main>;
}
