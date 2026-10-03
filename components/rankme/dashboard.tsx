"use client";
import { CreatorJourney } from "./creator-journey";
import { CreatorPreview } from "./creator-preview";
import { promoSummary, placementSummary } from "@/lib/rankme/config";
import {CommerceHistory} from "./commerce-history";
import {LoginMethods} from "./login-methods";
import { CreatorInsights } from "./creator-insights";
import { ProfileDiscoveryFields, type DiscoveryValues } from "./profile-discovery-fields";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  Plus,
  ArrowUpRight,
  Eye,
  MousePointer2,
  BarChart3,
  CreditCard,
  Download,
  LogOut,
  Settings2,
  Pencil,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  combinedPaidSummary, paidSummary,
  Profile,
  Settings,
  money,
  number,
  orderProfiles,
} from "@/lib/rankme/config";
import { Avatar } from "./board";
import { JoinForm, api } from "./join-form";
import { DemoNote } from "./shell";
import { leaderboardPath } from "@/lib/rankme/leaderboards";
export function Dashboard({
  demo,
  profiles,
  settings,
}: {
  demo: boolean;
  profiles: Profile[];
  settings: Settings;
}) {
  const router=useRouter();
  const lastAccountState=useRef<string|null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryValues>({category:"Creators",language:"",country:"",region:""});
  const [tab,setTab]=useState('profiles');
  useEffect(()=>{const selected=new URLSearchParams(location.search).get('tab');if(selected&&['settings','insights','payments'].includes(selected))setTab(selected);},[]);
  const [previewProfile,setPreviewProfile]=useState<Profile|null>(null);
  const [paymentReturn,setPaymentReturn]=useState('');
  useEffect(()=>{setPaymentReturn(new URLSearchParams(location.search).get('payment')||'');},[]);
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [boost, setBoost] = useState<Profile | null>(null),
    [edit, setEdit] = useState<Profile | null>(null),
    [name, setName] = useState(""),
    [bio, setBio] = useState(""),
    [deleting, setDeleting] = useState(false),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false), [editConsent,setEditConsent]=useState(false);
  const refresh = () =>
    api("me")
      .then(value=>{
        const signature=JSON.stringify(value.profiles?.map((p:any)=>[p.id,p.status,p.verified,p.name,p.bio,p.category_id,p.country,p.rank_score,p.promo_granted_at,p.paid_totals]));
        if(lastAccountState.current!==null&&lastAccountState.current!==signature)router.refresh();
        lastAccountState.current=signature;setData(value);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    if (demo) return;
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [demo]);
  const owned: Profile[] = demo
    ? profiles.slice(0, 2)
    : data?.profiles?.map((p: any) => ({
        ...profiles.find((x) => x.id === p.id),
        ...p,
        platform: p.social_platforms.name,
        category: p.categories.name,
        views: profiles.find((x) => x.id === p.id)?.views || 0,
        clicks: profiles.find((x) => x.id === p.id)?.clicks || 0,
      })) || [];
  const openedPlacement=useRef(false);
  useEffect(()=>{
    if(demo||!data||openedPlacement.current)return;
    const params=new URLSearchParams(location.search);
    const id=params.get('preview')||params.get('placement');
    if(!id)return;
    openedPlacement.current=true;
    const profile=owned.find(p=>p.id===id&&p.verified&&['active','pending_payment'].includes(p.status));
    if(profile)setPreviewProfile(profile);
    else setError('Profil není dostupný k náhledu. Zkontroluj jeho propojení a stav.');
    const url=new URL(location.href);url.searchParams.delete('placement');url.searchParams.delete('preview');history.replaceState(null,'',url.pathname+url.search+url.hash);
  },[data,demo,owned]);
  const views = owned.reduce((s, p) => s + p.views, 0),
    clicks = owned.reduce((s, p) => s + p.clicks, 0);
  return (
    <>
      {demo && <DemoNote />}
      {error && (
        <div className="form-error" role="alert">
          {error} <a href="/login">Přihlásit se →</a>
        </div>
      )}
      {paymentReturn&&<p className="notice" role="status">{paymentReturn==='cancelled'?'Platba byla zrušena. Můžeš se k ní vrátit u svého profilu.':'Vítej zpět. Po potvrzení platby se umístění a jeho hodnota aktualizují automaticky. Stav najdeš v přehledu plateb.'} <button type="button" className="text-link" onClick={()=>setTab("payments")}>Zobrazit platby</button></p>}
      <div className="account-bar">
        <span>
          {demo ? "Ukázkový účet" : data ? data.user.display_name || "Uživatel FameRiser" : "Načítání účtu…"}
        </span>
        <Button variant="outline" asChild>
          <a href="/connections">
            <ShieldCheck size={15} />
            Propojené účty
          </a>
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            if (demo) {
              toast("Demo účet není přihlášený.");
              return;
            }
            await api("auth", { action: "logout" });
            location.href = "/";
          }}
        >
          <LogOut size={14} /> Odhlásit se
        </Button>
      </div>
      <p className="account-total">Celkem za všechny tvoje profily: <strong>{combinedPaidSummary(owned)}</strong></p>
      <Tabs value={tab} onValueChange={setTab} className="dashboard-tabs">
        <TabsList variant="line">
          <TabsTrigger value="profiles">
            Moje profily <span className="count-pill">{owned.length}</span>
          </TabsTrigger>
          <TabsTrigger value="insights">Statistiky návštěvnosti</TabsTrigger>
          <TabsTrigger value="payments">Platby</TabsTrigger>
          <TabsTrigger value="settings">Nastavení účtu</TabsTrigger>
        </TabsList>
        <TabsContent value="profiles">
          <div className="dashboard-heading">
            <div>
              <h2>Tvoje profily a jejich umístění</h2>
              <p>Zkontroluj náhled, zobraz své místo nebo sleduj návštěvnost.</p>
            </div>
            <Button className="primary-button" asChild>
              <a href="/connections?add=1">
                <Plus size={16} /> Přidat účet
              </a>
            </Button>
          </div>
          {!demo&&!data&&!error&&<p role="status">Načítám tvoje profily…</p>}
          <div className="owned-profiles">
            {owned.map((p) => (
              <article key={p.id} className="owned-profile">
                <div className="owned-profile-main">
                  <Avatar p={p} size="large" />
                  <div>
                    {profiles.some((x) => x.id === p.id) ? (
                      <a href={`/p/${p.slug}`}>
                        <h3>{p.name}</h3>
                      </a>
                    ) : (
                      <h3>{p.name}</h3>
                    )}
                    <p>
                      @{p.username} · {p.platform}
                    </p>
                  </div>
                  <span className="owned-rank">
                    {orderProfiles(profiles).find((x) => x.id === p.id)?.rank
                      ? <><small>Most Famous</small>#{orderProfiles(profiles).find((x) => x.id === p.id)?.rank}</>
                      : p.total_paid > 0 || (p.rank_score||0)>0 || p.promo_granted_at
                        ? "Skrytý profil"
                        : "Soukromé · Nezaplaceno"}
                  </span>
                </div>
                <CreatorJourney current={!p.verified?0:profiles.some(x=>x.id===p.id)?3:1}/>
                <p className="owned-bio">{p.bio}</p>
                {p.payment_required&&p.status==='pending_payment'&&<p className="subtle-note">Facebook stránka je ověřená, ale zatím neveřejná. Do žebříčku se zařadí po potvrzení úspěšné platby od 5 USD.</p>}
                {p.promo_granted_at&&<p className="subtle-note">{promoSummary(p)||"Promo umístění"} · stejné funkce i statistiky jako u placeného profilu.</p>}
                {profiles.some((x) => x.id === p.id) && (
                  <a className="owned-board-position" href={leaderboardPath(p.platform)}>
                    {p.platform} · #{orderProfiles(profiles, "all", p.platform).find((x) => x.id === p.id)?.rank} v žebříčku sítě
                  </a>
                )}
                <div className="owned-numbers">
                  <span><small>Hodnota umístění</small><strong>{placementSummary(p)}</strong></span>
                  <span>
                    <small>Skutečně zaplaceno</small>
                    <strong>{paidSummary(p)}</strong>
                  </span>
                </div>
                {data?.payments?.filter((pay:any)=>pay.profile_id===p.id&&pay.status==='pending').map((pay:any)=><Button key={pay.id} variant="outline" onClick={async()=>{try{const r=await api('checkout/'+pay.id,{});if(r.url)location.href=r.url}catch(e){toast.error((e as Error).message)}}}>Dokončit rozpracovanou platbu</Button>)}
                <div className="owned-actions">
                  <Button variant="outline" onClick={()=>setPreviewProfile(p)}><Eye size={15}/>Náhled profilu</Button>
                  {profiles.some(x=>x.id===p.id)&&<><Button variant="outline" asChild><a href={`/p/${p.slug}`}>Zobrazit veřejný profil <ArrowUpRight size={15}/></a></Button><Button variant="outline" onClick={()=>setTab("insights")}><BarChart3 size={15}/>Moje statistiky</Button></>}
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEdit(p);setEditConsent(false);
                        setDiscovery({category:p.category, language:p.language || "",country:p.country || "",region:p.region || ""});
                      setName(p.name);
                      setBio(p.bio);
                    }}
                  >
                    <Pencil size={14} /> Upravit
                  </Button>
                  <Button
                    className="primary-button"
                    disabled={!demo && !p.verified}
                    onClick={() => p.status==='pending_payment'?setPreviewProfile(p):setBoost(p)}
                  >
                    {p.status==='pending_payment'?'Vybrat umístění':'Navýšit pozici'} <ArrowUpRight size={15} />
                  </Button>
                </div>
                <Button variant="link" className="verification-link" asChild>
                  <a href="/connections">
                    <ShieldCheck size={13} />
                    {p.verified
                      ? "Ověřený profil · Spravovat propojení"
                      : "Ověřit vlastnictví účtu"}
                  </a>
                </Button>
              </article>
            ))}
          </div>
          {(demo||data)&&!owned.length && (
            <div className="empty-state">
              <Plus />
              <h3>Tvůj první profil čeká.</h3>
              <p>
                Účty můžeš propojit zdarma. Po ověření můžeš získat promo umístění v aktivní akci, nebo zaplatit za pozici.
              </p>
              <Button asChild>
                <a href="/connections">Propojit účet zdarma</a>
              </Button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="insights"><CreatorInsights profiles={owned} demo={demo}/></TabsContent>
        <TabsContent value="payments">{demo?<p className="notice">V ukázce žádné platby neprobíhají.</p>:<CommerceHistory/>}</TabsContent>
        <TabsContent value="settings">
          <p className="notice"><a href="/account-consent">Věk a podmínky účtu</a> · <a href="/requests">Žádosti, rozhodnutí a ověření země</a></p>
          <h2 className="tab-title">Tvoje data jsou tvoje.</h2>
          {!demo&&<LoginMethods/>}
          <div className="settings-card">
            <div>
              <h3>Export osobních údajů</h3>
              <p>Stáhni profily a historii plateb ve formátu JSON.</p>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                demo
                  ? toast("Ukázkový účet nemá uložené osobní údaje.")
                  : location.assign("/api/account/export")
              }
            >
              <Download size={15} /> Exportovat
            </Button>
          </div>
          <div className="settings-card">
            <div>
              <h3>Soukromí a cookies</h3>
              <p>Uprav souhlas s měřením návštěv a kliknutí.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.dispatchEvent(new Event("rankme:privacy"))}
            >
              <Settings2 size={15} /> Upravit
            </Button>
          </div>
          <div className="settings-card danger-card">
            <div>
              <h3>Odstranit účet a osobní údaje</h3>
              <p>Profily ihned skryjeme a předáme žádost správci.</p>
            </div>
            <Button variant="destructive" onClick={() => setDeleting(true)}>
              Požádat o odstranění
            </Button>
          </div>
        </TabsContent>
      </Tabs>
      <Dialog open={!!previewProfile} onOpenChange={open=>{if(!open)setPreviewProfile(null);}}>
        <DialogContent className="creator-preview-dialog"><DialogTitle>Zkontroluj svůj profil</DialogTitle><DialogDescription>Takto budou tvoje údaje vypadat ve FameRiseru.</DialogDescription>
          {previewProfile&&<>
            <CreatorJourney current={1}/>
            <CreatorPreview name={previewProfile.name} username={previewProfile.username} platform={previewProfile.platform} bio={previewProfile.bio} avatar={previewProfile.avatar_url} country={previewProfile.country} category={previewProfile.category}/>
            {profiles.some(p=>p.id===previewProfile.id)?<><p className="notice">{previewProfile.promo_granted_at?'Promo umístění už je aktivní. Nic neplatíš.':'Tvůj profil už je v žebříčku.'}</p><div className="preview-actions"><Button className="primary-button" asChild><a href={`/p/${previewProfile.slug}`}>Zobrazit veřejný profil</a></Button><Button variant="outline" onClick={()=>{setPreviewProfile(null);setTab('insights');}}>Moje statistiky</Button></div></>:<><p className="subtle-note">Toto je soukromý náhled. Umístění potvrdíš v dalším kroku.</p><Button className="primary-button" disabled={!previewProfile.verified||!['active','pending_payment'].includes(previewProfile.status)} onClick={()=>{setBoost(previewProfile);setPreviewProfile(null);}}>Náhled je v pořádku · vybrat umístění</Button></>}
            <Button variant="ghost" onClick={()=>{const p=previewProfile;setEdit(p);setPreviewProfile(null);setEditConsent(false);setName(p.name);setBio(p.bio);setDiscovery({category:p.category,language:p.language||'',country:p.country||'',region:p.region||''});}}>Upravit jméno a popis</Button>
          </>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!boost} onOpenChange={(v) => !v && setBoost(null)}>
        <DialogContent className="join-dialog">
          <DialogTitle>{boost?.status==='pending_payment'?'Zařaď profil do žebříčku.':`Posuň @${boost?.username} výš.`}</DialogTitle>
          <DialogDescription>
            Zvol částku svého umístění. Platba se přičte k dosavadní hodnotě; nic se nestrhne automaticky.
          </DialogDescription>
          {boost && (
            <JoinForm
              existing={boost}
              previewReviewed
              profiles={profiles}
              settings={settings}
              demo={demo}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="profile-edit-dialog">
          <DialogTitle>Upravit profil</DialogTitle>
          <DialogDescription>
            Údaje se zobrazí u tvého veřejného profilu. Změna kategorie nemění zaplacené pořadí.
          </DialogDescription>
          <label>
            Jméno
            <Input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Bio
            <Textarea
              value={bio}
              maxLength={1000}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>
          <ProfileDiscoveryFields value={discovery} onChange={setDiscovery} description={`${name} ${bio} ${edit?.social_bio || ""}`} />
          <label><input type="checkbox" checked={editConsent} onChange={e=>setEditConsent(e.target.checked)}/>Souhlasím se zveřejněním těchto údajů a potvrzuji, že nejde o politickou ani volební propagaci. Nevkládám citlivé osobní údaje.</label>
          <Button
            disabled={busy||!editConsent}
            onClick={async () => {
              if (demo) {
                toast("V demu se změny profilu neukládají.");
                return;
              }
              if (!edit) return;
              setBusy(true);
              try {
                await api(
                  "profiles/" + edit.id,
                  {
                    name,
                    username: edit.username,
                    bio,
                    platform: edit.platform,
                    ...discovery,
                    social_url: edit.social_url,
                    avatar_url: edit.avatar_url,
                    ownership: true, non_political:editConsent, import_consent:false,
                    privacy: true,
                  },
                  "PATCH",
                );
                setEdit(null);
                await refresh();
                toast.success("Profil byl upraven.");
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Uložit změny
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent>
          <DialogTitle>Odstranění osobních údajů</DialogTitle>
          <DialogDescription>
            Profily se ihned skryjí. Platební záznamy mohou podléhat zákonné
            lhůtě uchování. Pro potvrzení napiš SMAZAT.
          </DialogDescription>
          <Input
            aria-label="Potvrzení odstranění"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button
            variant="destructive"
            disabled={confirm !== "SMAZAT" || busy}
            onClick={async () => {
              if (demo) {
                toast("Demo účet neobsahuje skutečné osobní údaje.");
                return;
              }
              setBusy(true);
              try {
                const r = await api("account/delete", { confirm });
                toast(r.message, { duration: 15000 });
                setDeleting(false);
                await refresh();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Odeslat žádost
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
