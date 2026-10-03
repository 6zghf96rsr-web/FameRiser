"use client";
import {boardSearch,type BoardMeta} from "@/lib/rankme/board-page";
import { ProfileCountry } from "./profile-country";
import {placementSummary,rankingSummary,combinedPlacementSummary} from "@/lib/rankme/config";
import { useMemo, useState, useEffect } from "react";
import {
  ArrowUpRight,
  MoveUpRight,
  Crown,
  Search,
  Trophy,
  Globe2,
  Zap,
  Eye,
  MousePointer2,
  Users,
  Info,
  SquarePlay,
  Music2,
  Gamepad2,
  Code2,
  Camera,
  Sparkles,
  TrendingUp,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { categoryLabel, languageLabel, countryLabel, filterProfiles, pageProfiles } from "@/lib/rankme/discovery";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { useProfileTracking } from "./profile-tracking";
import { VisitProfile } from "./visit-profile";
import { leaderboardPath } from "@/lib/rankme/leaderboards";
import { Header, Footer } from "./shell";
import { SignaturePodium } from "./signature-podium";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  APP,
  Profile,
  Settings,
  platforms,
  categories,
  money,
  number,
  orderProfiles,
  periods, periodLabel, periodAmount,
} from "@/lib/rankme/config";
export function Avatar({ p, size = "normal" }: { p: Profile; size?: string }) {
  return (
    <span
      className={`person-avatar ${size}`}
      data-network={p.platform.toLowerCase()}
    >
      {p.avatar_url ? (
        <img src={p.avatar_url} alt={p.name} />
      ) : (
        <span>
          {p.name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </span>
      )}
    </span>
  );
}
export function PlatformIcon({ name }: { name: string }) {
  const Icon =
    name === "Instagram"
      ? Camera
      : name === "YouTube"
        ? SquarePlay
        : name === "TikTok"
          ? Music2
          : name === "Twitch" || name === "Kick"
            ? Gamepad2
            : Globe2;
  return <Icon size={15} />;
}
export default function Board({
  initialProfiles, meta: initialMeta,
  demo = true,
  settings = { name: APP.name, minimum: APP.minimum, increment: APP.increment },
  config = { url: "", key: "" },
  activity = [],
  error = null,
  initialCategory = "all",
  initialPlatform = "all",
  initialPeriod = "all",
  initialQuery = "",
  initialFull = false, initialPage = 1, initialLanguage = "all", initialCountry = "all", initialRegion = "",
}: {
  initialProfiles: Profile[]; meta: BoardMeta;
  demo?: boolean;
  settings?: Settings;
  config?: { url: string; key: string };
  activity?: any[];
  error?: string | null;
  initialCategory?: string;
  initialPlatform?: string;
  initialPeriod?: string;
  initialQuery?: string;
  initialFull?: boolean; initialPage?: number; initialLanguage?: string; initialCountry?: string; initialRegion?: string;
}) {
  const platform = initialPlatform;
  const [language, setLanguage] = useState(initialLanguage), [country, setCountry] = useState(initialCountry), [region, setRegion] = useState(initialRegion);
  const [page, setPage] = useState(initialPage);
  const [filtersOpen, setFiltersOpen] = useState(initialCategory !== 'all' || initialLanguage !== 'all' || initialCountry !== 'all' || !!initialRegion);
  const full = initialFull;
  const [period, setPeriod] = useState(initialPeriod),
    [category, setCategory] = useState(initialCategory),
    [query, setQuery] = useState(initialQuery);
  const [profiles, setProfiles] = useState(initialProfiles),
    [events, setEvents] = useState(activity);
  const [meta,setMeta]=useState(initialMeta);
  const [loading,setLoading]=useState(false),[boardError,setBoardError]=useState(error);
  const [connection, setConnection] = useState(demo ? "demo" : "live");
  const requestKey=boardSearch({platform,period,category,query,full,page,language,country,region});
  const [loadedKey,setLoadedKey]=useState(requestKey);
  useEffect(() => {
    const controller=new AbortController(); let pending=false;
    const refresh=async()=>{
      if(pending||document.visibilityState!=='visible')return;
      pending=true;
      try{
        const r=await fetch('/api/leaderboard?'+requestKey,{signal:controller.signal});
        if(!r.ok)throw Error();
        const b=await r.json() as {profiles:Profile[];activity:any[];meta:BoardMeta};if(controller.signal.aborted)return;
        setProfiles(b.profiles);setEvents(b.activity);setMeta(b.meta);setLoadedKey(requestKey);
        setBoardError(null);setConnection(demo?'demo':'live');
      }catch{
        if(!controller.signal.aborted){setConnection('offline');setBoardError('Žebříček se nepodařilo aktualizovat. Zkus to prosím znovu.');}
      }finally{pending=false;if(!controller.signal.aborted)setLoading(false);}
    };
    setLoading(true);
    const debounce=setTimeout(()=>void refresh(),250);
    const timer=demo?undefined:setInterval(()=>void refresh(),30000);
    const resume=()=>{if(document.visibilityState==='visible')void refresh();};
    document.addEventListener('visibilitychange',resume);
    return()=>{controller.abort();clearTimeout(debounce);clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
  },[requestKey,demo]);
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      ctx.registerTool(
        {
          name: "filter_leaderboard",
          title: "Filtrovat žebříček",
          description:
            "Změní viditelné filtry žebříčku. Nevytváří profil ani platbu.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              platform: { type: "string", enum: ["all", ...platforms] },
              category: { type: "string", enum: ["all", ...categories] },
              period: { type: "string", enum: ["all", "today", "week", "month"] },
            },
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          async execute(input: any) {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).some(
                (k) => !["query", "platform", "category", "period"].includes(k),
              ) ||
              (input.query !== undefined && typeof input.query !== "string") ||
              (input.platform &&
                !["all", ...platforms].includes(input.platform)) ||
              (input.category &&
                !["all", ...categories].includes(input.category)) ||
              (input.period && !["all", "today", "week", "month"].includes(input.period))
            )
              throw new Error("Neplatný filtr.");
            const q = input.query || "",
              p = input.platform || "all",
              c = input.category || "all",
              t = input.period || "all";
            flushSync(() => {
              setQuery(q);
              setCategory(c);
              setPeriod(t);
              setLanguage("all"); setCountry("all"); setRegion(""); setPage(1);
            });
            if (p !== platform) {
              const search = new URLSearchParams({ query: q, category: c, period: t });
              window.location.assign(`${leaderboardPath(p)}?${search}#leaderboard`);
            }
            const response=await fetch('/api/leaderboard?'+boardSearch({platform:p,period:t,category:c,query:q,full:false,page:1,language:'all',country:'all',region:''}));
            if(!response.ok)throw new Error('Žebříček se nepodařilo načíst.');
            const result=await response.json() as {meta:BoardMeta};
            return {count:result.meta.total,filters:{query:q,platform:p,category:c,period:t}};
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [profiles, platform]);
  const stale=loadedKey!==requestKey;
  const sorted=stale?[]:profiles;
  const pagination={...meta,items:sorted};
  useProfileTracking(stale||loading?[]:profiles.map(p=>p.id),demo,platform,loadedKey);
  const top=full?[]:sorted.slice(0,3),rows=full?sorted:sorted.slice(3);
  const all=profiles;
  const title=platform==='all'?'Most Famous':`${platform} Fame`;
  const filtered=!!query||category!=='all'||language!=='all'||country!=='all'||!!region;
  const languageOptions=meta.facets.languages;
  const countryOptions=[...meta.facets.countries].sort((a,b)=>countryLabel(a).localeCompare(countryLabel(b),'cs'));
  const regionOptions=meta.facets.regions;
  const networkLink = (network: string, view = full, nextPage = 1) => {
    const search = new URLSearchParams();
    if (period !== "all") search.set("period", period);
    if (category !== "all") search.set("category", category);
    if (query) search.set("query", query);
    if (language !== 'all') search.set('language', language);
    if (country !== 'all') search.set('country', country);
    if (region) search.set('region', region);
    if (view) search.set('view', 'full');
    if (view && nextPage > 1) search.set('page', String(nextPage));
    return `${leaderboardPath(network)}${search.size ? `?${search}` : ""}`;
  };
  const resetFilters = () => { setQuery(''); setCategory('all'); setLanguage('all'); setCountry('all'); setRegion(''); setPage(1); };
  useEffect(() => { window.history.replaceState(null, '', networkLink(platform, full, stale?page:pagination.page)); }, [query, category, language, country, region, period, full, pagination.page, page, stale, platform]);
  return (
    <>
      <Header name={settings.name} active="/" />
      <main className="main-shell network-theme arena-page" data-network={platform.toLowerCase()}>
        {demo && (
          <div className="top-demo-label">
            DEMO ŽEBŘÍČEK{" "}
            <span>{meta.counts.all||0} fiktivních profilů · bez skutečných plateb</span>
          </div>
        )}
        {boardError && (
          <div className="form-error" role="alert">
            {boardError}
          </div>
        )}
        <section className="arena-hero discovery-hero">
          <div><span className="signature-eyebrow">Tvůj profil. Tvoje místo.</span><h1>{platform === "all" ? <>MOST <span className="signature-title-end"><em>FAMOUS</em><img className="signature-title-logo" src="/brand/fameriser-fr-icon.png" width="80" height="80" alt="" /></span></> : <>{platform} <em>FAME.</em></>}</h1></div>
          <div className="signature-intro"><p className="desktop-ranking-explanation">Najdi tvůrce podle svých zájmů a navštiv jejich sociální sítě. Bez registrace.</p>
            <Button className="primary-button discover-profiles-button" asChild><a href="#profile-search" onClick={() => requestAnimationFrame(() => document.getElementById("profile-search")?.focus())}><Search size={17} aria-hidden="true"/>Objevovat profily</a></Button>
            <Button className="creator-entry-button" variant="outline" asChild><a href="/join">Přidat svůj profil <ArrowUpRight size={17} aria-hidden="true" /></a></Button>

          </div>
        </section>
        <nav className="network-boards discovery-networks" aria-label="Žebříčky podle sociální sítě">
          <a className="most-famous-tab" data-network="all" href={networkLink('all', false)} aria-current={platform === 'all' ? 'page' : undefined}>
            <Trophy size={16} /> Most Famous <span>{meta.counts.all||0}</span>
          </a>
          <div className="network-six">
            {platforms.map(network => <a key={network} data-network={network.toLowerCase()} href={networkLink(network, false)} aria-current={platform === network ? 'page' : undefined}>
              <PlatformIcon name={network} /><span className="network-tab-name">{network}</span><span className="network-tab-count">{meta.counts[network]||0}</span>
            </a>)}
          </div>
        </nav>
        <div className="board-layout" id="leaderboard">
          <section className="leaderboard-main" aria-busy={loading||stale}>
            <div className="section-heading">
              <div>
                <h2>{full ? 'Celý žebříček' : 'TOP 10'} <span className="count-pill" aria-label={`${meta.total} profilů celkem`}>{meta.total} profilů</span></h2>
                {filtered && <p>Výsledky výběru · čísla zachovávají pořadí v žebříčku.</p>}
              </div>
              <Tabs value={period} onValueChange={(value) => { setPeriod(value); setPage(1); }}>
                <TabsList className="period-tabs">
                  {periods.map(value => <TabsTrigger key={value} value={value}>{periodLabel(value)}</TabsTrigger>)}
                </TabsList>
              </Tabs>
            </div>
            <div className="filter-bar discovery-search">
              <div className="search-field"><Search size={17} /><Input id="profile-search" aria-label="Hledat profil" placeholder="Jméno, @profil nebo tvorba…" value={query} onChange={e => {setQuery(e.target.value); setPage(1);}} /></div>
              <Button variant="outline" aria-expanded={filtersOpen} aria-controls="discovery-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16} /> Filtry{filtered ? ' •' : ''}</Button>
            </div>
            {filtersOpen && <div id="discovery-filters" className="discovery-filters">
              <label>Kategorie tvorby<Select value={category} onValueChange={v => {setCategory(v); setPage(1);}}><SelectTrigger aria-label="Kategorie tvorby"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Všechny kategorie</SelectItem>{categories.map(c => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}</SelectContent></Select></label>
              <label>Jazyk tvorby<Select value={language} onValueChange={v => {setLanguage(v); setPage(1);}}><SelectTrigger aria-label="Jazyk tvorby"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Všechny jazyky</SelectItem>{[...new Set([...languageOptions, ...(language !== 'all' ? [language] : [])])].map(c => <SelectItem key={c} value={c}>{languageLabel(c)}</SelectItem>)}</SelectContent></Select></label>
              <label>Země<Select value={country} onValueChange={v => {setCountry(v); setRegion(''); setPage(1);}}><SelectTrigger aria-label="Země"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Všechny země</SelectItem>{[...new Set([...countryOptions, ...(country !== 'all' ? [country] : [])])].map(c => <SelectItem key={c} value={c}>{countryLabel(c)}</SelectItem>)}</SelectContent></Select></label>
              <label>Region<Select value={region || 'all'} onValueChange={v => {setRegion(v === 'all' ? '' : v); setPage(1);}}><SelectTrigger aria-label="Region"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Všechny regiony</SelectItem>{[...new Set([...regionOptions, ...(region ? [region] : [])])].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></label>
              {filtered && <Button variant="ghost" onClick={resetFilters}>Zrušit filtry</Button>}
              <p>Jazyk a místo uvádí tvůrce. Nabídka obsahuje údaje dostupné ve vybraném žebříčku.</p>
            </div>}
            {(loading||stale)&&<p role="status">Načítám žebříček…</p>}
            {top.length > 0 && <SignaturePodium profiles={top} demo={demo} period={period} filtered={filtered} />}
            {rows.length > 0 && !full && <div className="arena-list-heading"><h2>Další v TOP 10</h2><span>{title}</span></div>}
            {rows.length > 0 && <div className="ranking-table discovery-table">
              <div className="table-heading">
                <span>POŘADÍ</span>
                <span>PROFIL</span>
                <span>ZOBRAZENÍ</span>
                <span>HODNOTA UMÍSTĚNÍ</span>
                <span />
              </div>
              {rows.map((p) => (
                <article
                  style={{ viewTransitionName: "profile-" + p.id }}
                  data-profile-id={p.id}
                  data-network={p.platform.toLowerCase()}
                  className="ranking-row network-theme"
                  key={p.id}
                >
                  <span className="row-rank">
                    {String(p.rank).padStart(2, "0")}
                  </span>
                  <a href={`/p/${p.slug}`} className="row-person">
                    <Avatar p={p} />
                    <div>
                      <h3 className="profile-name-with-country"><span data-profile-name-id={p.id}>{p.name}</span><ProfileCountry country={p.country}/></h3>
                      <span>
                        <span className="network-label"><PlatformIcon name={p.platform} />{p.platform}</span>
                        <span className="row-handle">@{p.username}</span>
                        <i>· {categoryLabel(p.category)}</i>
                      </span>
                      <p className="creator-bio">{p.bio || p.social_bio}</p>
                    </div>
                  </a>
                  <div className="row-views">
                    <Eye size={14} />
                    {number(p.views)}
                  </div>
                  <strong className="row-paid">
                    {placementSummary(p)}<small>Hodnota umístění · celkem{(p.rank_score!=null||period!=="all") && <> · {rankingSummary(p,period)}{period!=="all"&&<> za {periodLabel(period)}</>}</>}</small>
                  </strong>
                  <VisitProfile profile={p} demo={demo} className="row-visit" />
                </article>
              ))}
            </div>}
            {!loading&&!stale&&!boardError&&!sorted.length && (
              <div className="empty-state">
                <Search size={32} />
                <h3>Tady je zatím klid.</h3>
                <p>{filtered
                  ? "Zkus jiné jméno nebo uprav filtry."
                  : period !== "all" ? `Za posledních ${periodLabel(period)} tu zatím nejsou žádné platby.`
                  : `Žebříček ${platform === "all" ? "čeká" : platform + " čeká"} na první profil s ověřením a platbou.`}</p>
                {filtered ? (
                <Button
                  variant="outline"
                  onClick={resetFilters}
                >
                  Zrušit filtry
                </Button>
                ) : <a href="/connections">Připravit svůj profil →</a>}
              </div>
            )}
            {sorted.length > 0 && <div className="discovery-paging">
              <p role="status">Zobrazeno {(pagination.page - 1) * pagination.size + 1}–{Math.min(pagination.page * pagination.size, meta.total)} z {meta.total} profilů{filtered ? ' ve výběru' : ''}</p>
              {!full ? <Button variant="outline" asChild><a href={networkLink(platform, true)}>Zobrazit celý žebříček <ArrowUpRight size={16} /></a></Button> : <>
                <Pagination aria-label="Stránkování žebříčku"><PaginationContent>
                  {pagination.page > 1 && <PaginationItem><PaginationLink size="default" href={networkLink(platform, true, pagination.page - 1)}><ChevronLeft size={16} /> Předchozích 100</PaginationLink></PaginationItem>}
                  <PaginationItem><span>Strana {pagination.page} z {pagination.pages}</span></PaginationItem>
                  {pagination.page < pagination.pages && <PaginationItem><PaginationLink size="default" href={networkLink(platform, true, pagination.page + 1)}>Dalších 100 <ChevronRight size={16} /></PaginationLink></PaginationItem>}
                </PaginationContent></Pagination>
                <a href={networkLink(platform, false)}>Zpět na TOP 10</a>
              </>}
            </div>}
            <details className="mobile-ranking-explanation"><summary>Jak funguje pořadí?</summary><p>Pořadí určuje RankScore z plateb a přidělených kreditů. Hodnota umístění zahrnuje obojí; nejde pouze o zaplacenou částku.</p></details>
            <p className="list-footer">
              {period === "all" ? "Pořadí podle celkového součtu potvrzených plateb po odečtení vratek." : `Pořadí podle součtu plateb za posledních ${periodLabel(period)} po odečtení vratek. Celková částka je uvedena u každého profilu.`}
            </p>
          </section>
          <aside className="board-sidebar">
            <div className="sidebar-card activity-card">
              <div className="sidebar-title">
                <h3>
                  <Zap size={17} /> Děje se právě teď
                </h3>
                <span className="live-label">
                  {demo ? "DEMO" : connection === "live" ? "LIVE" : "PŘIPOJUJI"}
                </span>
              </div>
              <p className="activity-empty">
                {demo
                  ? "Prohlížíš ukázkový žebříček s fiktivními profily."
                  : "Nové platby a změny pořadí se zobrazí zde."}
              </p>
              {demo ? (
                <>
                  {all[0]?.rank===1 && <div className="demo-activity">
                    <span className="activity-icon">
                      <Crown size={17} />
                    </span>
                    <div>
                      <strong>@{all[0]?.username}</strong> drží první místo
                      <small>Ukázka aktivity · demo</small>
                    </div>
                  </div>}
                  <div className="demo-activity">
                    <span className="activity-icon blue-icon">
                      <TrendingUp size={17} />
                    </span>
                    <div>
                      Každý může být <strong>další #1</strong>
                      <small>Stačí překonat nejvyšší částku</small>
                    </div>
                  </div>
                </>
              ) : (
                events
                  .filter(
                    (e) =>
                      e.kind === "payment" &&
                      all.some((p) => p.id === e.profile_id),
                  )
                  .slice(0, 4)
                  .map((e) => (
                    <div className="demo-activity" key={e.id}>
                      <span className="activity-icon blue-icon">
                        <TrendingUp size={17} />
                      </span>
                      <div>
                        <strong>
                          @
                          {
                            profiles.find((p) => p.id === e.profile_id)
                              ?.username
                          }
                        </strong>{" "}
                        posunul svůj profil
                        <small>
                          {e.payload.rank
                            ? `Most Famous #${e.payload.rank} · `
                            : ""}
                          {new Date(e.created_at).toLocaleTimeString("cs-CZ", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </div>
                    </div>
                  ))
              )}
              <div className="activity-footer">
                <span />{" "}
                {demo
                  ? "Ukázková data · bez skutečných plateb"
                  : "Aktualizace každých 30 sekund"}
              </div>
            </div>
            <div className="transparency">
              <Info size={18} />
              <p>
                <strong>Fér hra. Jasná pravidla.</strong>Pořadí není hodnocení
                kvality ani popularity. Pořadí určuje RankScore z plateb bez daně, nikoli počet sledujících.
                <a href="/how-it-works">
                  Víc o principu žebříčku <ArrowUpRight size={13} />
                </a>
              </p>
            </div>
            <div className="category-links">
              <h3>Najdi svůj svět</h3>
              {[
                ["Creators", Sparkles],
                ["Gamers", Gamepad2],
                ["Photography", Camera],
                ["Developers", Code2],
              ].map(([c, Icon]: any) => (
                <a
                  href={`/category/${String(c).toLowerCase()}`}
                  key={String(c)}
                >
                  <Icon size={16} />
                  {categoryLabel(String(c))}
                  <ArrowUpRight size={14} />
                </a>
              ))}
            </div>
          </aside>
        </div>
        <section className="stats-strip" aria-label="Statistiky žebříčku">
          <div>
            <Users />
            <strong>{number(meta.summary.count)}</strong>
            <span>profilů v žebříčku</span>
          </div>
          <div>
            <Eye />
            <strong>{number(meta.summary.views)}</strong>
            <span>zobrazení profilů</span>
          </div>
          <div>
            <MousePointer2 />
            <strong>
              {number(meta.summary.clicks)}
            </strong>
            <span>návštěv sociálních sítí</span>
          </div>
          <div className="stats-spend">
            <Zap />
            <strong>
              {placementSummary({placement_totals:meta.summary.totals} as Profile)}
            </strong>
            <span>v žebříčku</span>
          </div>
        </section>
        <Footer name={settings.name} />
        {demo && (
          <div className="demo-ribbon">
            DEMO{" "}
            <span>
              Fiktivní profily. Ukázkové částky. Žádné skutečné platby.
            </span>
          </div>
        )}
      </main>
    </>
  );
}
