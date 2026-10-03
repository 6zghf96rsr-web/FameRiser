"use client";
import { CreatorJourney } from "./creator-journey";
import { useEffect, useState } from "react";
import { Link2, ShieldCheck, ExternalLink, Plus, LoaderCircle, Unplug, Clock3, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { platforms } from "@/lib/rankme/config";
import { accountURL, type Connection } from "@/lib/rankme/connections";
import type { AuthStatus } from "@/lib/rankme/auth-status";
import { connectionOptions, type ConnectionOption } from "@/lib/rankme/connection-options";
import { api, ApiError } from "./join-form";
import type { FacebookPage } from "@/lib/rankme/facebook-pages";
import { POLICY_VERSION } from "@/lib/rankme/policies";

export function Connections({ status }: { status: AuthStatus }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [platform, setPlatform] = useState<string>("Instagram");
  const [url, setURL] = useState("");
  const [owns, setOwns] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(!status.ready);
  const [addOpen, setAddOpen] = useState(false);
  const [remove, setRemove] = useState<Connection | null>(null);
  const [pages,setPages]=useState<FacebookPage[]>([]);
  const [pagesOpen,setPagesOpen]=useState(false);
  const [pagesAfter,setPagesAfter]=useState<string|null>(null);
  const [selectedPage,setSelectedPage]=useState<string|null>(null);
  const [pageConsent,setPageConsent]=useState(false),[pageNonPolitical,setPageNonPolitical]=useState(false);
  const options=connectionOptions(status);
  const verified=connections.filter(c=>c.status==='verified'||c.account_kind==='facebook_page');
  const drafts=connections.filter(c=>c.status!=='verified'&&c.account_kind!=='facebook_page');
  const loadPages=async(after?:string)=>{
    const data=await api('connections/facebook-pages'+(after?'?after='+encodeURIComponent(after):''));
    setPages(previous=>after?[...new Map([...previous,...data.pages].map((p:FacebookPage)=>[p.id,p])).values()]:data.pages);
    setPagesAfter(data.after);setPagesOpen(true);setAddOpen(true);
  };
  const refresh=async()=>{const data=await api('connections');setConnections(data.connections);setLoaded(true);return data.connections as Connection[];};
  const previewPath=(c:Connection)=>c.listing?`/dashboard?preview=${c.listing.id}`:`/join?connection=${c.id}`;
  useEffect(()=>{
    const query=new URLSearchParams(location.search);
    const result=query.get('result');
    const reviewId=query.get('review');
    const messages:Record<string,string>={youtube:'YouTube kanál je propojený a ověřený.',cancelled:'Propojení bylo zrušeno. Účty se nezměnily.','no-channel':'U vybraného Google účtu není YouTube kanál.',failed:'Propojení se nepodařilo. Zkus to znovu.',login:'Přihlašovací metoda je připojená.','facebook-pages-cancelled':'Výběr stránek byl zrušen. Žádná stránka se nepřidala.','facebook-pages-failed':'Připojení stránek se nepodařilo. Zkontroluj účet správce a povolení na Facebooku.'};
    if(result&&messages[result]){if(['youtube','login'].includes(result))toast.success(messages[result]);else setError(messages[result]);}
    if(query.get('error')==='auto-placement')setError('Přihlášení proběhlo, ale profil se nepodařilo připojit. Vyber svou síť v nabídce Přidat účet a zkus to znovu.');
    if(query.get('add')==='1')setAddOpen(true);
    if(result||query.has('error')||query.has('add')||query.has('welcome')||query.has('review'))history.replaceState(null,'','/connections');
    if(!status.ready)return;
    if(result==='facebook-pages'){setBusy('pages-list');setAddOpen(true);void loadPages().catch(e=>setError(e.message)).finally(()=>setBusy(''));}
    void refresh().then(items=>{if(query.get('welcome')==='1'||reviewId){const connected=items.find(c=>c.status==='verified'&&(!reviewId||c.id===reviewId));if(connected)location.replace(previewPath(connected));else setAddOpen(true);}}).catch(e=>{setError(e.message);setLoaded(true);});
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{});},15000);
    return()=>clearInterval(timer);
  },[status.ready]);
  const run=async(key:string,task:()=>Promise<void>)=>{setBusy(key);setError('');try{await task();}catch(e){setError((e as Error).message);}finally{setBusy('');}};
  const action=(c:Connection,action:string)=>run(c.id,async()=>{await api(`connections/${c.id}/${action}`,{});await refresh();setRemove(null);});
  const connect=(option:ConnectionOption)=>run(option.id,async()=>{
    if(option.id==='facebookPages'){const r=await api('connections/facebook-pages/start',{});location.assign(r.url);return;}
    if(option.id==='youtube'){const r=await api('connections/youtube',{});location.assign(r.url);return;}
    if(!option.provider)return;
    // Reuse a valid provider proof; if it has expired, continue directly at the provider.
    try{const result=await api('connections/oauth',{provider:option.provider});const items=await refresh();setAddOpen(false);const connected=items.find(c=>c.status==='verified'&&c.id===result.id);if(connected)location.assign(previewPath(connected));else toast.success('Účet je propojený a ověřený. Zkontroluj jeho náhled níže.');}
    catch(e){if(!(e instanceof ApiError)||e.status!==409)throw e;const r=await api('connections/oauth',{provider:option.provider,reauthorize:true});location.assign(r.url);}
  });
  const cards=(items:Connection[])=><div className="connected-account-grid">
          {items.map((c) => {
            return (
              <article className="connection-card" key={c.id}>
                <div className="connection-card-head">
                  <div>
                    <span className="eyebrow">{c.platform}</span>
                    <h3>{c.label}</h3>
                  </div>
                  <span
                    className={
                      "connection-badge " +
                      (c.status === "verified" ? "verified" : "")
                    }
                  >
                    {c.status === "verified" ? (
                      <ShieldCheck size={14} />
                    ) : (
                      <Clock3 size={14} />
                    )}
                    {c.status === "verified"
                      ? "Ověřeno"
                      : c.account_kind==='facebook_page'?"Obnovit ověření":"Návrh · Nepřipojeno"}
                  </span>
                </div>
                <a
                  className="connection-url"
                  href={c.social_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Otevřít na síti {c.platform}
                  <ExternalLink size={14} />
                </a>
                <p className="connection-visibility">
                  {c.listing?.public
                    ? c.listing.promo_granted_at ? "Veřejný profil · Ověřeno · Promo umístění" : "Veřejný profil · Ověřeno a zaplaceno"
                    : c.listing && ["hidden", "deleted"].includes(c.listing.status)
                      ? "Profil je skrytý · Podrobnosti ve správě účtu"
                      : "Soukromý účet · Není v žebříčku"}
                </p>
                {c.status === "verified" ? (
                  <details className="connection-proof-details"><summary>Podrobnosti ověření</summary><p className="subtle-note">
                    {c.method === "youtube_oauth"
                      ? "Vlastnictví potvrdil Google pro tento YouTube kanál."
                      : c.method === "provider_oauth" ? "Přístup k profilu nebo správu stránky potvrdila přímo sociální síť."
                      : "Vlastnictví bylo potvrzeno při dřívějším ověření."}{" "}
                    {c.verified_at &&
                      new Date(c.verified_at).toLocaleDateString("cs-CZ")}
                  </p></details>
                ) : (
                  <div className="connection-challenge">
                    <p className="subtle-note">{c.verification_notice||"Účet zatím není propojený. Ověření zprávou čeká na spuštění."}</p>
                  </div>
                )}
                <div className="connection-card-actions">
                  <Button
                    variant="ghost"
                    disabled={Boolean(busy)}
                    onClick={() => setRemove(c)}
                  >
                    <Unplug size={14} />
                    {c.status === "verified" ? "Odpojit" : "Smazat návrh"}
                  </Button>
                  {c.status!=='verified'&&c.account_kind==='facebook_page'&&<Button variant="outline" disabled={!!busy} onClick={()=>{setPagesOpen(false);setAddOpen(true);}}>Obnovit propojení</Button>}
                  {c.status !== "verified" ? null : <Button variant="outline" asChild>
                    <a
                      href={
                        c.listing?.public
                          ? `/dashboard?preview=${c.listing.id}`
                          : c.listing && ["hidden", "deleted"].includes(c.listing.status)
                            ? "/dashboard"
                            : c.listing
                              ? `/dashboard?preview=${c.listing.id}`
                              : `/join?connection=${c.id}`
                      }
                    >
                      {c.listing?.public
                        ? "Zkontrolovat náhled"
                        : c.listing && ["hidden", "deleted"].includes(c.listing.status)
                          ? "Spravovat profil"
                          : "Zkontrolovat náhled"}
                      <Plus size={14} />
                    </a>
                  </Button>}
                </div>
              </article>
            );
          })}
  </div>;
  return <div className="connections-page account-hub">
    <CreatorJourney current={0}/>
    <div className="account-hub-toolbar"><div><h2>Moje propojené účty <span className="count-pill">{verified.length}</span></h2><p>Ověření a propojení jsou zdarma. Veřejné umístění spravuješ zvlášť.</p></div>
      <Dialog open={addOpen} onOpenChange={open=>{if(!busy){setAddOpen(open);setError('');}}}>
        <DialogTrigger asChild><Button className="primary-button"><Plus size={17}/>Přidat účet</Button></DialogTrigger>
        <DialogContent className="connect-picker"><DialogTitle>{pagesOpen?'Vyber Facebook stránku':'Přidat účet'}</DialogTitle><DialogDescription>Vyber síť. Přístup k účtu ověříme přímo u jejího poskytovatele; heslo FameRiser nikdy nedostane.</DialogDescription>
          {error&&<p className="form-error" role="alert">{error}</p>}
          {busy==='pages-list'&&<p role="status">Načítám tvoje stránky…</p>}
          {!pagesOpen&&<>
            <div className="connect-options">{options.filter(o=>o.available).map(option=><Button key={option.id} variant="outline" className="connect-option" disabled={!!busy} onClick={()=>void connect(option)}><span><strong>{option.label}</strong><small>{option.description}</small></span>{busy===option.id?<LoaderCircle className="animate-spin" size={18}/>:<ArrowRight size={18}/>}</Button>)}</div>
            {!options.some(o=>o.available)&&<p className="connection-notice" role="status">{status.unavailable?'Dostupnost propojení se nepodařilo ověřit. Zkus obnovit stránku.':'Propojování sítí v tomto náhledu zatím není aktivní.'}</p>}
            <p className="subtle-note">U podporovaných osobních profilů může při splnění pravidel aktivní promo akce vzniknout veřejné umístění zdarma. Facebook stránky se zveřejní až po tvém souhlasu a úspěšné platbě.</p>
            {options.some(o=>!o.available)&&<div className="connect-coming"><strong>Připravujeme</strong><p>{options.filter(o=>!o.available).map(o=>o.label).join(' · ')}</p></div>}
          </>}
        {pagesOpen&&<div className="facebook-page-picker">
          <h3>Vyber stránku k propojení</h3>
          <p className="subtle-note">Zobrazujeme pouze stránky s oprávněním ke správě nebo tvorbě obsahu. Oprávnění průběžně kontrolujeme; při jeho ztrátě stránku skryjeme. Výběr je dostupný 10 minut. U každé vybrané stránky oprávnění znovu zkontrolujeme.</p>
          {!pages.length&&<p role="status">Meta zatím nevrátila žádnou stránku s potřebným oprávněním. Zkontroluj, že jsi vybral/a správný Facebook účet a při propojení povolil/a přístup ke stránce.</p>}
          {pages.map(page=><article className="connection-card" key={page.id}>
            <div className="connection-card-head"><div>{page.avatar_url&&<img src={page.avatar_url} width={48} height={48} alt="" loading="lazy" referrerPolicy="no-referrer"/>}<h3>{page.name}</h3><span className="subtle-note">Facebook stránka{page.category?' · '+page.category:''}</span></div></div>
            <a className="connection-url" href={page.social_url} target="_blank" rel="noopener noreferrer">Otevřít na Facebooku <ExternalLink size={14}/></a>
            <Button variant="outline" disabled={Boolean(busy)} aria-expanded={selectedPage===page.id} onClick={()=>{setSelectedPage(page.id);setPageConsent(false);setPageNonPolitical(false);}}>Vybrat tuto stránku</Button>
            {selectedPage===page.id&&<div className="facebook-page-consent">
              <label className="check-line"><Checkbox checked={pageConsent} onCheckedChange={value=>setPageConsent(value===true)}/><span>Jsem oprávněn/a zastupovat stránku <strong>{page.name}</strong>. Souhlasím s převzetím jejího názvu, fotografie a odkazu a jejich veřejným zobrazením ve FameRiseru po úspěšné platbě. Seznámil/a jsem se se <a href="/policies/privacy" target="_blank" rel="noopener noreferrer">zásadami soukromí</a>.</span></label>
              <label className="check-line"><Checkbox checked={pageNonPolitical} onCheckedChange={value=>setPageNonPolitical(value===true)}/><span>Nejde o politickou ani volební propagaci.</span></label>
              <Button className="primary-button" disabled={Boolean(busy)||!pageConsent||!pageNonPolitical} onClick={()=>void run('page-'+page.id,async()=>{
                const result=await api('connections/facebook-pages',{page_id:page.id,consent:{accepted:pageConsent,non_political:pageNonPolitical,version:POLICY_VERSION}});
                toast.success('Stránka je ověřená. Zveřejní se až po úspěšné platbě.');
                location.assign('/dashboard?preview='+encodeURIComponent(result.profile_id));
              })}>{busy==='page-'+page.id?<LoaderCircle className="animate-spin"/>:<ShieldCheck size={16}/>}Zkontrolovat náhled stránky</Button>
              <p className="subtle-note">Nejdříve uvidíš náhled. Částku od 5 USD a platební podmínky potvrdíš až potom.</p>
            </div>}
          </article>)}
          {pagesAfter&&<Button variant="outline" disabled={Boolean(busy)} onClick={()=>void run('pages-list',()=>loadPages(pagesAfter))}>Načíst další stránky</Button>}
          <Button variant="ghost" disabled={Boolean(busy)} onClick={()=>void run('pages-list',()=>loadPages())}>Obnovit seznam</Button>
        </div>}
          {pagesOpen&&<Button variant="ghost" disabled={!!busy} onClick={()=>setPagesOpen(false)}>Zpět na výběr sítě</Button>}
        </DialogContent>
      </Dialog>
    </div>
    {error&&!addOpen&&<p className="form-error" role="alert">{error}</p>}
    {!loaded?<p role="status">Načítám propojené účty…</p>:verified.length?cards(verified):<div className="empty-state connection-empty"><Link2/><h3>Zatím nemáš propojený účet.</h3><p>Vyber „Přidat účet“ a připoj svou sociální síť.</p></div>}
    <p className="account-hub-settings"><a href="/dashboard?tab=settings">Nastavení přihlašování a účtu →</a></p>
    {status.ready&&<details className="connection-drafts"><summary>Rozpracované odkazy <span className="count-pill">{drafts.length}</span></summary><p>Tyto odkazy jsou soukromé. Zatím nejsou ověřenými propojenými účty a nemohou do žebříčku.</p>{cards(drafts)}<details className="draft-editor"><summary>Uložit další odkaz na později</summary><div className="connection-form">          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("add", async () => {
                accountURL(url, platform);
                await api("connections", {
                  platform,
                  social_url: url,
                  ownership: owns,
                });
                setURL("");
                setOwns(false);
                await refresh();
                toast.success(
                  "Návrh je uložený soukromě. Účet zatím není propojený ani zveřejněný.",
                );
              });
            }}
          >
            <label>
              Sociální síť
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="full-width">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {platform === "Facebook" && <p className="subtle-note">Osobní profil ověř přihlášením v nabídce Přidat účet. Pro stránku použij „Facebook stránka“ a vyber ji ze seznamu, který potvrdí Meta. Vložení odkazu samo správu stránky neověří.</p>}
            <label>
              Odkaz na tvůj profil
              <Input
                type="url"
                required
                maxLength={500}
                value={url}
                onChange={(e) => setURL(e.target.value)}
                placeholder={
                  platform === "Instagram"
                    ? "https://instagram.com/tvuj.ucet"
                    : "https://…"
                }
              />
            </label>
            <label className="check-line">
              <Checkbox
                checked={owns}
                onCheckedChange={(v) => setOwns(v === true)}
              />
              <span>Tento účet vlastním nebo mám oprávnění jej spravovat.</span>
            </label>
            <Button
              className="primary-button full-width"
              disabled={!status.ready || !owns || Boolean(busy)}
            >
              {busy === "add" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              Uložit soukromý návrh
            </Button>
          </form>
</div></details></details>}
    <AlertDialog open={!!remove} onOpenChange={open=>{if(!open&&!busy)setRemove(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{remove?.status==='verified'?'Odpojit':'Smazat návrh'} {remove?.label}?</AlertDialogTitle><AlertDialogDescription>{remove?.status==='verified'?'Propojení a ověření se odeberou. Profil se skryje z žebříčku až do nového ověření; dosavadní platby zůstanou evidované.':'Odstraní se pouze tento soukromý návrh. Účet na sociální síti zůstane zachovaný.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={!!busy}>Zrušit</AlertDialogCancel><AlertDialogAction disabled={!!busy} onClick={()=>{if(remove)void action(remove,'disconnect');}}>{remove?.status==='verified'?'Odpojit účet':'Smazat návrh'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
