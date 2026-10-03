import {LEGAL_URLS} from '@/lib/rankme/legal';
import {notFound,redirect} from 'next/navigation';
import {PageShell} from '@/components/rankme/shell';
import {policies,POLICY_VERSION,type PolicyKind} from '@/lib/rankme/policies';
import {PrivacyButton} from '@/components/rankme/info';
export default async function PolicyPage({params}:{params:Promise<{kind:string}>}) {
 const {kind}=await params;if(kind==='privacy')redirect(LEGAL_URLS.privacy);if(kind==='deletion')redirect(LEGAL_URLS.deletion);if(!Object.hasOwn(policies,kind))notFound();const doc=policies[kind as PolicyKind];
 const ready=process.env.BUSINESS_NAME&&process.env.BUSINESS_ADDRESS&&process.env.BUSINESS_ID;
 return <PageShell title={doc.title} eyebrow="PRAVIDLA A KONTAKTY"><div className="editorial-content"><p>Verze {POLICY_VERSION} · <a href={`/legal/${POLICY_VERSION}/${kind}.html`} download>Uložit znění</a></p><p className="notice">Připravené znění pro pilot a budoucí službu. Ostré platby nejsou spuštěné. Promo se řídí dostupností v aplikaci. Zbývá doplnit provozovatele, konečné kontakty a smluvní nastavení plateb; stav záruk dodavatelů uvádějí zásady soukromí.</p><p>{ready?`${process.env.BUSINESS_NAME}, ${process.env.BUSINESS_ADDRESS}, IČO ${process.env.BUSINESS_ID}`:'Identita budoucího provozovatele zatím není doplněna.'}</p>{doc.sections.map(([title,text])=><section key={title}><h2>{title}</h2><p>{text}</p></section>)}{kind==='cookies'&&<PrivacyButton/>}</div></PageShell>;
}
