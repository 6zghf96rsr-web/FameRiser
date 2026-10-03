"use client";
import { CreatorJourney } from "./creator-journey";
import { CreatorPreview } from "./creator-preview";
import {priceCatalog,cash,type PriceCurrency} from "@/lib/rankme/commerce";
import {POLICY_VERSION} from "@/lib/rankme/policies";
import { ProfileDiscoveryFields } from "./profile-discovery-fields";
import { languages, countries, suggestCategory } from "@/lib/rankme/discovery";
import { LEGAL_URLS } from "@/lib/rankme/legal";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Upload,
  Crown,
  LockKeyhole,
  ShieldCheck,
  LoaderCircle,
  Camera,
  Globe2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  APP,
  Profile,
  Settings,
  platforms,
  money,
  estimateRank,
  targetAmount,
  orderProfiles,
  periodAmount, periodReached, periodLabel,
} from "@/lib/rankme/config";
import { safeSocialURL } from "@/lib/rankme/validation";
import { accountURL, type Connection } from "@/lib/rankme/connections";
import { DemoNote } from "./shell";
import type { SavedInstagram } from "@/lib/rankme/instagram";
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function api(url: string, data?: unknown, method?: string) {
  const r = await fetch("/api/" + url, {
    method: method || (data ? "POST" : "GET"),
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const v: any = await r.json();
  if (!r.ok) throw new ApiError(v.error || "Požadavek se nepodařilo dokončit.", r.status);
  return v;
}
export function JoinDialog({
  open,
  onOpenChange,
  profiles,
  settings,
  demo,
  amount,
  period = "all",
  initialPlatform = "all",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: Profile[];
  settings: Settings;
  demo: boolean;
  amount?: number;
  period?: string;
  initialPlatform?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="join-dialog">
        <DialogTitle>Tvoje cesta nahoru.</DialogTitle>
        <DialogDescription>
          Přidej profil a vyber si místo v žebříčku.
        </DialogDescription>
        {!demo?<div className="connect-options"><Button className="primary-button" asChild><a href="/dashboard">Vybrat můj profil</a></Button><Button variant="outline" asChild><a href="/connections?add=1">Přidat nový účet</a></Button></div>:<JoinForm
          key={String(amount) + period + initialPlatform}
          profiles={profiles}
          settings={settings}
          demo={demo}
          initialAmount={amount}
          period={period}
          initialPlatform={initialPlatform}
        />}
      </DialogContent>
    </Dialog>
  );
}
export function JoinForm({
  profiles,
  settings,
  demo,
  initialAmount,
  existing,
  previewReviewed = false,
  instagram,
  period = "all",
  initialPlatform = "all",
}: {
  profiles: Profile[];
  settings: Settings;
  demo: boolean;
  initialAmount?: number;
  existing?: Profile;
  previewReviewed?: boolean;
  instagram?: SavedInstagram;
  period?: string;
  initialPlatform?: string;
}) {
  const [step, setStep] = useState(existing ? (existing.status === "pending_payment" && !previewReviewed ? 1 : 2) : instagram ? 1 : 0),
    [platform, setPlatform] = useState(existing?.platform || (instagram ? "Instagram" : platforms.find((p) => p === initialPlatform)) || "Instagram"),
    [rankScope, setRankScope] = useState(initialPlatform === "all" ? "all" : "network"),
    [name, setName] = useState(existing?.name || instagram?.username || ""),
    [username, setUsername] = useState(existing?.username || instagram?.username || ""),
    [bio, setBio] = useState(existing?.bio || ""),
    [url, setURL] = useState(existing?.social_url || instagram?.social_url || ""),
    [category, setCategory] = useState(existing?.category || "Creators"),
    [language, setLanguage] = useState(existing?.language || ""),
    [country, setCountry] = useState(existing?.country || ""),
    [region, setRegion] = useState(existing?.region || ""),
    [socialBio, setSocialBio] = useState(existing?.social_bio || ""),
    [photo, setPhoto] = useState<File | null>(null),
    [preview, setPreview] = useState(existing?.avatar_url || ""),
    [own, setOwn] = useState(false),
    [privacy, setPrivacy] = useState(false),
    [agree, setAgree] = useState(false),
    [amount, setAmount] = useState(
      String(
        (initialAmount ||
          Math.max(
            settings.minimum,
            existing
              ? existing.total_paid + settings.increment
              : settings.minimum,
          )) / 100,
      ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState<string | null>(existing?.id || null),
    [done, setDone] = useState(false);
  const [currency,setCurrency]=useState<PriceCurrency>('USD'),[gross,setGross]=useState('5'),[billingCountry,setBillingCountry]=useState('CZ'),[adult,setAdult]=useState(false),[immediate,setImmediate]=useState(false),[nonPolitical,setNonPolitical]=useState(false),[importConsent,setImportConsent]=useState(false);
  const [paymentMin,setPaymentMin]=useState<number|null>(500);
  useEffect(()=>{
    if(demo)return;let cancelled=false;
    if(currency==='USD'){setPaymentMin(500);return;}
    setPaymentMin(null);
    void api('commerce/minimum?currency='+currency).then(q=>{if(!cancelled){setPaymentMin(q.minimum);setGross(String(q.minimum/10**priceCatalog[currency].decimals));}}).catch(e=>{if(!cancelled)setError(e.message);});
    return ()=>{cancelled=true;};
  },[currency,demo]);
  const grossMinor=Math.round(Number(gross)*10**priceCatalog[currency].decimals);
  const [importSource,setImportSource]=useState<Connection|null>(null);

  const [promoRemaining,setPromoRemaining]=useState<number|null>(null);
  const [promoEligible,setPromoEligible]=useState(false);
  const [proofs, setProofs] = useState<Connection[]>([]);
  const paidPage = existing?.payment_required || proofs.some(c=>c.account_kind==='facebook_page'&&c.platform===platform&&c.social_url===url);
  const promoAvailable = !paidPage && (demo || promoEligible) && settings.promo_enabled === true && !existing?.promo_granted_at && !(existing?.total_paid);
  const usePromo = promoAvailable && promoRemaining !== 0;
  const requestId = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);
  const ownershipVerified = proofs.some((c) => {
    if (c.status !== "verified" || c.platform !== platform) return false;
    try { return c.social_url === accountURL(url, platform); }
    catch { return false; }
  });
  useEffect(() => {
    requestId.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    const connectionId = new URLSearchParams(location.search).get("connection");
    if (demo) return;
    let cancelled = false;
    void api("connections")
      .then((data) => {
        if (cancelled) return;
        setProofs(data.connections);
        setPromoRemaining(data.promo_remaining);
        setPromoEligible(data.promo_eligible===true);
        if (existing || !connectionId) return;
        const c = data.connections.find((c: any) => c.id === connectionId);
        if (!c) throw new Error("Propojený účet se nepodařilo najít.");
        setPlatform(c.platform);
        setImportSource(c);

        setCategory(suggestCategory(`${c.label} ${c.social_bio || ''}`) || 'Creators');
        setLanguage(languages.includes(c.suggested_language) ? c.suggested_language : '');

        setURL(c.social_url);
        setName(c.label.slice(0, 60));
        setUsername(
          c.label
            .replace(/^@/, "")
            .replace(/[^\p{L}\p{N}._-]/gu, "")
            .slice(0, 50),
        );
        setStep(1);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [demo, existing]);
  useEffect(() => {
    if (!photo) return;
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  const periodProfiles = profiles.filter(p => periodAmount(p,period) > 0).map(p => ({...p,total_paid:periodAmount(p,period),reached_amount_at:periodReached(p,period)}));
  const networkProfiles = periodProfiles.filter(p => p.platform === platform);
  const rankingProfiles = rankScope === "all" ? periodProfiles : networkProfiles;
  const current = existing ? periodAmount(existing,period) : 0;
  const amountMinor = Math.round(Number(amount) * 100);
  const delta = amountMinor - current;
  const newTotal = (existing?.total_paid || 0) + delta;
  const estimated = estimateRank(rankingProfiles, amountMinor, existing?.id);
  const estimatedGlobal = estimateRank(periodProfiles, amountMinor, existing?.id);
  const estimatedNetwork = estimateRank(networkProfiles, amountMinor, existing?.id);
  const currentRank = orderProfiles(rankingProfiles).find(
    (p) => p.id === existing?.id,
  )?.rank;
  const next = () => {
    setError("");
    if (step === 1 && !existing) {
      if (name.trim().length < 2 || !username.trim() || bio.length > 1000) {
        setError("Vyplň jméno, uživatelské jméno a popis do 1 000 znaků.");
        return;
      }
      try {
        safeSocialURL(
          url,
          platform,
          [],
          platform === "Jiná"
            ? [new URL(url).hostname.toLowerCase().replace(/^www\./, "")]
            : [],
        );
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      if (!/^[\p{L}\p{N}._-]{2,50}$/u.test(username)) {
        setError(
          "Uživatelské jméno může obsahovat písmena, čísla, tečku, pomlčku a podtržítko.",
        );
        return;
      }
      if (!own || !privacy || !nonPolitical) {
        setError("Potvrď oprávnění propagovat profil a zveřejnění údajů.");
        return;
      }
    }
    if (
      step === 2 && !usePromo && demo &&
      (!Number.isSafeInteger(amountMinor) ||
        delta < settings.increment ||
        newTotal < settings.minimum ||
        newTotal > 100000000)
    ) {
      setError(
        `Minimální vstup je ${money(settings.minimum)} a navýšení alespoň ${money(settings.increment)}.`,
      );
      return;
    }
    if(step===2&&!usePromo&&!demo&&(!Number.isSafeInteger(grossMinor)||(paymentMin===null||grossMinor<paymentMin)||grossMinor>priceCatalog[currency].max)){setError('První vklad i každý příhoz musí být alespoň 5 USD nebo zobrazený ekvivalent. Počkej na načtení minima a zkontroluj částku.');return;}
    setStep((s) => s + 1);
  };
  const submit = async () => {
    setError("");
    if (!agree || !adult || !nonPolitical || (!usePromo && !immediate)) {
      setError("Před pokračováním potvrď podmínky, věk, nepolitickou propagaci a případné zahájení služby.");
      return;
    }
    if (demo) {
      setDone(true);
      return;
    }
    if (!ownershipVerified) {
      setError("Před zařazením do žebříčku nejdříve ověř vlastnictví účtu v části Propojené účty.");
      return;
    }
    setBusy(true);
    try {
      let id = created;
      if (!id) {
        let avatar = preview || null;
        if (photo) {
          const fd = new FormData();
          fd.append("file", photo);
          const r = await fetch("/api/upload", { method: "POST", body: fd });
          const data: any = await r.json();
          if (!r.ok) throw new Error(data.error);
          avatar = data.url;
        }
        const p = await api("profiles", {
          name,
          username,
          bio,
          social_url: url,
          platform,
          category,
          language, country, region,
          avatar_url: avatar,
          ownership: own, non_political:nonPolitical, import_consent:importConsent,
          privacy,
        });
        id = p.id;
        setCreated(id);
        if(p.promo_granted_at) {window.location.assign(`/dashboard?preview=${id}`);return;}
      }
      if (usePromo) {
        const admission = await api(`profiles/${id}/promo`, {accepted:agree});
        window.location.assign(`/dashboard?preview=${id}`);
        return;
      }
      const checkout = await api("checkout", {
        profile_id: id,
        amount:grossMinor,currency,country:billingCountry,adult,immediate,non_political:nonPolitical,version:POLICY_VERSION,
        accepted: agree,
        request_id: requestId.current,
      });
      window.location.assign(checkout.url);
    } catch (e) {
      if((e as Error).message.includes("1 000 promo míst")) setPromoRemaining(0);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (done)
    return (
      <div className="join-complete">
        <span>
          <Check size={30} />
        </span>
        <h2>Takto bude vypadat tvoje místo.</h2>
        {usePromo ? <p>Ověřený profil <strong>@{username}</strong> by získal promo umístění zdarma se všemi funkcemi a statistikami. Získá kredit 5 USD zdarma. Při stejném skóre rozhoduje první registrace ve FameRiseru.</p> : <p>
          Za {money(delta)} by měl profil <strong>@{username}</strong>{" "}
          odhadované místo <strong>#{estimated}</strong> v žebříčku{" "}
          {periodLabel(period)}.
        </p>}
        <div className="notice">
          Toto byl pouze náhled. Veřejný profil nevznikl a žádná platba neproběhla.
          {instagram && " Tvůj uložený Instagram zůstává soukromý."}
        </div>
        <Button
          onClick={() => {
            setDone(false);
            setStep(2);
          }}
        >
          Upravit umístění
        </Button>
        <a href="/" className="text-link">
          Zpět na žebříček <ArrowRight size={15} />
        </a>
      </div>
    );
  return (
    <div className="join-flow">
      {demo && <DemoNote />}
      <CreatorJourney current={step===0?0:step===1?1:2}/>
      <p className="subtle-note">Připojení je zdarma. Umístění získáš v aktivní promo akci, nebo platbou od 5 USD.</p>
      {step >= 2 && <p className="subtle-note">{step===2?'Vyber umístění':'Potvrď umístění'} · {name} · {platform}</p>}
      {step === 0 && (
        <div className="flow-step">
          <h2>Kde tě svět najde?</h2>
          <p>Vyber sociální síť, na které chceš být vidět.</p>
          <p className="subtle-note">Začínáme šesti sítěmi: {platforms.join(", ")}. Další přidáme později.</p>
          <div className="platform-grid">
            {platforms.map((p) => (
              <button
                className={platform === p ? "selected" : ""}
                onClick={() => setPlatform(p)}
                key={p}
              >
                {p === "Instagram" ? (
                  <Camera size={18} />
                ) : (
                  <Globe2 size={18} />
                )}
                <span>{p}{p === "Facebook" && <small className="platform-option-detail">Profily i stránky</small>}</span>
                {platform === p && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
      {step === 1 && existing && <div className="flow-step"><h2>Zkontroluj svůj profil</h2><CreatorPreview name={name} username={username} platform={platform} bio={bio} avatar={preview} country={country} category={category}/><p className="subtle-note">Údaje můžeš upravit ve správě svého profilu. Po kontrole vybereš umístění.</p></div>}
      {step === 1 && !existing && (
        <div className="flow-step">
          <h2>Ukaž, kdo jsi.</h2>{importSource&&<div className="notice"><p>Ověření účtu samo nezveřejní bio ani obrázek.</p><Button type="button" variant="outline" onClick={()=>{setBio((importSource.social_bio||'').slice(0,1000));setSocialBio(importSource.social_bio||'');setPreview(importSource.avatar_url||'');setImportConsent(true)}}>Převzít bio a fotografii z propojeného účtu</Button></div>}
          <CreatorPreview name={name} username={username} platform={platform} bio={bio} avatar={preview} country={country} category={category}/>
          <div className="photo-upload">
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Nahrát profilovou fotografii"
            >
              {preview ? (
                <img src={preview} alt="Náhled fotografie" />
              ) : (
                <Camera size={24} />
              )}
              <span>
                <PlusIcon />
              </span>
            </button>
            <div>
              <strong>Profilová fotografie</strong>
              <p>JPG, PNG nebo WebP · do 2 MB</p>
              <Button variant="link" onClick={() => fileRef.current?.click()}>
                Nahrát fotografii
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (
                    f.size > 2097152 ||
                    !["image/jpeg", "image/png", "image/webp"].includes(f.type)
                  ) {
                    setError("Vyber JPG, PNG nebo WebP do 2 MB.");
                    return;
                  }
                  setPhoto(f);
                  setError("");
                }
              }}
            />
          </div>
          <div className="field-grid">
            <label>
              Jméno / přezdívka
              <Input
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="Např. Alex Pixel"
                autoComplete="nickname"
              />
            </label>
            <label>
              Uživatelské jméno
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
                placeholder="alex.pixel"
                maxLength={50}
              />
            </label>
          </div>
          <label>
            Odkaz na {platform}
            <Input
              type="url"
              placeholder={
                platform === "Instagram"
                  ? "https://instagram.com/tvuj.profil"
                  : "https://…"
              }
              value={url}
              onChange={(e) => setURL(e.target.value)}
              maxLength={500}
            />
          </label>
          <label>
            Bio / popis tvorby{" "}
            <span className="character-count">{bio.length}/1000</span>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Čím žiješ? Co tvoříš?"
              maxLength={1000}
            />
          </label>
          <p className="subtle-note">{socialBio ? 'Bio bylo načteno při propojení. Popis pro FameRiser můžeš upravit.' : 'Pokud síť bio neposkytne, zkopíruj ho sem nebo napiš vlastní popis tvorby.'}</p>
          <ProfileDiscoveryFields value={{category, language, country, region}} description={`${name} ${bio} ${socialBio}`} onChange={v => {setCategory(v.category); setLanguage(v.language); setCountry(v.country); setRegion(v.region);}} />
          <label className="check-line">
            <Checkbox
              checked={own}
              onCheckedChange={(v) => setOwn(v === true)}
            />
            Potvrzuji, že jsem vlastníkem profilu nebo mám oprávnění jej
            propagovat.
          </label>
          <label className="check-line">
            <Checkbox
              checked={privacy}
              onCheckedChange={(v) => setPrivacy(v === true)}
            />
            <span>
              Rozumím, že jméno, fotografie, bio a údaje profilu budou veřejné a mohou být indexovány vyhledávači. Nezadávám citlivé údaje ani údaje cizích osob. Souhlasím se zveřejněním podle{" "}
              <a href={LEGAL_URLS.privacy} target="_blank">
                zásad soukromí
              </a>
              .
            </span>
          </label>
        </div>
      )}
      {step===1&&!existing&&<label className="check-line"><Checkbox checked={nonPolitical} onCheckedChange={v=>setNonPolitical(v===true)}/>Profil nepropaguje politickou ani volební kampaň.</label>}
      {step === 2 && (
        <div className="flow-step">
          <h2>{usePromo ? "Tvoje místo zdarma" : "Vyber hodnotu umístění"}</h2>
          {usePromo && <div className="notice"><div>
            <strong>Promo kredit 5 USD zdarma</strong>
            <p>Prvních 1 000 ověřených sociálních profilů napříč všemi sítěmi získá kredit 5 USD na umístění zdarma. Každý sociální účet může získat promo místo jen jednou. Stejné funkce, statistiky a možnost navýšit pozici jako u placeného umístění. Dostupnost se potvrdí při dokončení. {promoRemaining !== null && `Zbývá ${promoRemaining} míst.`}</p>
          </div></div>}
          {!demo&&!usePromo&&<div className="field-grid"><label>Měna<select value={currency} onChange={e=>{const c=e.target.value as PriceCurrency;setCurrency(c);setPaymentMin(c==='USD'?500:null);setGross(c==='USD'?'5':'')}}>{Object.keys(priceCatalog).map(c=><option key={c}>{c}</option>)}</select></label><label>Platba nyní včetně daní<Input type="number" value={gross} disabled={paymentMin===null} min={(paymentMin??1)/10**priceCatalog[currency].decimals} max={priceCatalog[currency].max/10**priceCatalog[currency].decimals} step={currency==='JPY'?1:0.01} onChange={e=>setGross(e.target.value)}/></label><label>Fakturační země<select value={billingCountry} onChange={e=>setBillingCountry(e.target.value)}>{countries.map(c=><option key={c}>{c}</option>)}</select></label><p>První vklad i každý příhoz: nejméně 5 USD{currency!=='USD'&&(paymentMin===null?' · Načítám přepočet…':` · ${cash(paymentMin,currency)}`)}. Částku přičteme k tvému umístění.</p><details className="payment-explanation"><summary>Jak se platba započítá?</summary><p>Jde o novou platbu, nikoli požadovaný celkový zůstatek. Pořadí určuje hodnota bez daně převedená do RankScore. Fakturační země sama neověří zemi profilu. Vyšší platby nad limit vyžadují individuální posouzení.</p></details></div>}
          {usePromo ? <p>Celkem zaplaceno: <strong>0 Kč</strong>. Promo kredit: 5 USD zdarma, započtený do skóre zvlášť od plateb. Při stejném skóre rozhoduje první registrace ve FameRiseru. Pozici můžeš později navýšit platbou.</p> : demo ? <>
          <p>
            {rankScope === "all" ? "Most Famous" : `Žebříček ${platform}`} ·{" "}
            {period !== "all"
              ? `Posledních ${periodLabel(period)}`
              : "Celkově · celková hodnota profilu"}
            . Vyber místo nebo vlastní částku.
          </p>
          <div className="rank-scope" role="group" aria-label="Žebříček pro výběr místa">
            <button type="button" aria-pressed={rankScope === "network"} onClick={() => setRankScope("network")}>{platform}</button>
            <button type="button" aria-pressed={rankScope === "all"} onClick={() => setRankScope("all")}>Most Famous</button>
          </div>
          <p className="subtle-note">Platíš jednou. Stejná částka určuje obě pozice.</p>
          <div className="position-choices">
            {[10, 5, 3, 2, 1]
              .filter(
                (r) =>
                  r <=
                  orderProfiles(rankingProfiles).filter(
                    (p) => p.id !== existing?.id,
                  ).length +
                    1,
              )
              .map((r) => {
                const val = targetAmount(
                  rankingProfiles,
                  r,
                  settings.minimum,
                  settings.increment,
                  existing?.id,
                );
                return (
                  <button
                    key={r}
                    disabled={val <= current}
                    onClick={() => setAmount(String(val / 100))}
                    className={amountMinor === val ? "selected" : ""}
                  >
                    <span>
                      {r === 1 ? <Crown size={16} /> : <Zap size={15} />} Získat
                      #{r}
                    </span>
                    <strong>{money(val)}</strong>
                  </button>
                );
              })}
          </div>
          <label>
            Vlastní{" "}
            {period !== "all"
              ? `částka za posledních ${periodLabel(period)}`
              : "celková hodnota profilu"}
            <div className="amount-field">
              <Input
                type="number"
                min={
                  Math.max(settings.minimum, current + settings.increment) / 100
                }
                max={1000000}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Celková hodnota profilu"
              />
              <span>Kč</span>
            </div>
          </label>
          <div className="estimated-position">
            <div>
              <span>Odhad · {platform}</span>
              <strong>#{Number.isFinite(amountMinor) ? estimatedNetwork : "—"}</strong>
            </div>
            <div>
              <span>Odhad · Most Famous</span>
              <strong>#{Number.isFinite(amountMinor) ? estimatedGlobal : "—"}</strong>
            </div>
            <div>
              <span>Platíš nyní</span>
              <strong>{money(Math.max(0, delta))}</strong>
            </div>
          </div>
          <p className="subtle-note">
            Jde o aktuální odhad. Pořadí se může do potvrzení platby změnit.
          </p></> : null}
        </div>
      )}
      {step === 3 && (
        <div className="flow-step">
          <h2>{usePromo ? "Potvrď umístění zdarma" : "Potvrď své umístění"}</h2>
          <p>Zkontroluj si vše před {demo ? "náhledem" : usePromo ? "zařazením zdarma" : "platbou"}.</p>
          <div className="checkout-person">
            {preview ? (
              <img src={preview} alt="Profil" />
            ) : (
              <span>{name.slice(0, 1)}</span>
            )}
            <div>
              <strong>{name}</strong>
              <p>
                @{username} · {platform}
              </p>
            </div>
            <span className="checkout-rank" title={rankScope === "all" ? "Most Famous" : platform}>{usePromo ? "Promo" : demo ? `#${estimated}` : "Umístění"}</span>
          </div>
          {usePromo ? <div className="notice"><p><strong>Promo kredit 5 USD · platíš 0 Kč</strong><br />Po ověření a potvrzení volné kapacity získáš stejné funkce jako platící uživatelé, včetně soukromých statistik. Při stejném skóre rozhoduje první registrace ve FameRiseru. Vyšší celkové skóre může tuto pozici překonat.</p></div> : !demo ? <div className="notice"><p>Platíš nyní: <strong>{cash(grossMinor,currency)}</strong> včetně daní. Poskytovatel služby: FameRiser. Prodávající a Merchant of Record: subjekt Dodo uvedený v checkoutu. Daň vypočte Dodo; částka bez daně vytváří RankScore.</p></div> : <dl className="checkout-summary">
            <div>
              <dt>Současná pozice · {rankScope === "all" ? "Most Famous" : platform}</dt>
              <dd>{currentRank ? "#" + currentRank : "Nový profil"}</dd>
            </div>
            <div>
              <dt>Celkem zaplaceno</dt>
              <dd>{money(existing?.total_paid || 0)}</dd>
            </div>
            <div>
              <dt>Nová celková hodnota</dt>
              <dd>{money(newTotal)}</dd>
            </div>
            <div>
              <dt>Odhad · {platform} · {periodLabel(period)}</dt>
              <dd>#{estimatedNetwork}</dd>
            </div>
            <div>
              <dt>Odhad · Most Famous · {periodLabel(period)}</dt>
              <dd>#{estimatedGlobal}</dd>
            </div>
            <div className="checkout-total">
              <dt>Platíš nyní</dt>
              <dd>{money(delta)}</dd>
            </div>
          </dl>}
          <div className="notice">
            <ShieldCheck size={19} />
            <p>
              {usePromo ? "Získáváš reklamní pozici zdarma. Jiný uživatel tě může překonat platbou. Umístění negarantuje návštěvy ani nové sledující." : "Kupuješ reklamní pozici. Jiný uživatel tě může kdykoliv překonat. Platba negarantuje umístění, návštěvy ani followery."}
            </p>
          </div>
          <label className="check-line">
            <Checkbox
              checked={agree}
              onCheckedChange={(v) => setAgree(v === true)}
            />
            <span>
              Rozumím principu žebříčku i zvoleného umístění a souhlasím s{" "}
              <a href="/terms" target="_blank">
                podmínkami
              </a>
              .
              {existing?.payment_required&&<> Souhlasím se zveřejněním stránky <strong>{existing.name}</strong> v žebříčku po potvrzení této platby.</>}
            </span>
          </label>
          <label className="check-line"><Checkbox checked={adult} onCheckedChange={v=>setAdult(v===true)}/>Je mi alespoň 18 let.</label>
          <label className="check-line"><Checkbox checked={nonPolitical} onCheckedChange={v=>setNonPolitical(v===true)}/>Nejde o politickou ani volební propagaci.</label>
          {!usePromo&&<label className="check-line"><Checkbox checked={immediate} onCheckedChange={v=>setImmediate(v===true)}/><span>Výslovně žádám o zahájení služby po potvrzení platby před uplynutím lhůty pro odstoupení. Tím automaticky nezanikají má zákonná práva. <a href="/policies/refunds">Vrácení platby a odstoupení</a>.</span></label>}
          {!usePromo && <div className="payment-methods">
            <LockKeyhole size={14} /> Platba přes Dodo Payments — dostupné metody určí checkout{" "}


            <span>Apple Pay</span>
            <span>Google Pay</span>
          </div>}
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
          {error.includes("přihlas") && (
            <a href="/login" target="_blank" rel="noopener noreferrer">
              Přejít na přihlášení →
            </a>
          )}
        </div>
      )}
      <div className="flow-actions">
        {step > (existing ? (existing.status === "pending_payment" && !previewReviewed ? 1 : 2) : 0) && (
          <Button
            variant="ghost"
            onClick={() => {
              setStep((s) => s - 1);
              setError("");
            }}
            disabled={busy}
          >
            <ArrowLeft size={15} /> Zpět
          </Button>
        )}
        {step < 3 ? (
          <Button className="primary-button" onClick={next}>
            {step===1 ? "Náhled je v pořádku" : step===2 ? "Zkontrolovat a potvrdit" : "Pokračovat"} <ArrowRight size={16} />
          </Button>
        ) : !demo && !ownershipVerified ? (
          <Button className="primary-button" asChild><Link href="/connections">Nejdříve ověřit účet <ShieldCheck size={16} /></Link></Button>
        ) : (
          <Button
            className="primary-button"
            disabled={busy || !agree || !adult || !nonPolitical || (!usePromo && !immediate)}
            onClick={submit}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <LockKeyhole size={16} />
            )}{" "}
            {demo ? "Zobrazit demo náhled" : usePromo ? "Zařadit zdarma v promo akci" : `Zaplatit ${cash(grossMinor,currency)}`}
          </Button>
        )}
      </div>
    </div>
  );
}
function PlusIcon() {
  return <span>+</span>;
}
