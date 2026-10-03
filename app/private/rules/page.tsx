import {notFound} from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {privateCoreEnabled,privatePilotReady,PRIVATE_OPERATOR} from '@/lib/core/private-v1';
import {privatePolicy} from '@/lib/core/private-policy-v1';
import '../private.css';
export const dynamic='force-dynamic';
export const metadata={title:'Pravidla soukromého pilotu — FameRiser',robots:{index:false,follow:false}};
export default function PrivateRules(){
  if(!privateCoreEnabled())notFound();
  const operator=`${PRIVATE_OPERATOR.name}, ${PRIVATE_OPERATOR.address}, IČO ${PRIVATE_OPERATOR.ico}`;
  const email=process.env.SUPPORT_EMAIL||'info@fameriser.com';
  return <main className="private-core"><header className="private-header"><Link className="private-brand" href="/private"><Image src="/brand/fameriser-fr-icon.png" width={40} height={40} alt=""/> FameRiser</Link><span>Pravidla soukromého pilotu</span></header><article className="private-inner private-rules"><p className="private-eyebrow">VERZE {privatePolicy.version}</p><h1>Pravidla a ochrana údajů</h1>{!privatePilotReady()&&<p className="private-note">Pracovní návrh. Nová registrace je vypnutá do schválení tohoto znění a nastavení provozu.</p>}<p><strong>Provozovatel:</strong> {operator}<br/><strong>Kontakt:</strong> <a href={`mailto:${email}`}>{email}</a></p><p><Link href="/private/report">Oznámit nezákonný obsah nebo porušení pravidel</Link></p><h2>Podmínky používání</h2>{privatePolicy.sections.map(s=><section key={s.title}><h3>{s.title}</h3><p>{s.text}</p></section>)}<h2>Informace o zpracování údajů</h2>{privatePolicy.privacy.map(s=><section key={s.title}><h3>{s.title}</h3><p>{s.text}</p></section>)}<p>Pro používání YouTube ověření platí také <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">podmínky služby YouTube</a>.</p><p>Oprávnění Google můžeš odvolat na <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener noreferrer">stránce přístupu aplikací</a>. Další informace uvádějí <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">zásady Google</a>.</p><p><Link href="/private">Zpět do pilotu</Link></p></article></main>;
}
