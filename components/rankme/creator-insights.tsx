"use client";
import {useEffect,useState} from 'react';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Button} from '@/components/ui/button';
import {Profile,number,hasPlacementAccess} from '@/lib/rankme/config';
import {api} from './join-form';
type Insight = {profile_id:string;board_views:number;name_views:number;daily_name_viewers:number;impressions:number;detail_views:number;clicks:number;daily_clickers:number;daily:{day:string;name_views:number;impressions:number;clicks:number}[]};
export function CreatorInsights({profiles,demo}:{profiles:Profile[];demo:boolean}) {
 const [days,setDays]=useState('30'),[rows,setRows]=useState<Insight[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=> {if(demo)return;let active=true;setBusy(true);setError('');api(`me/insights?days=${days}`).then(r=>{if(active)setRows(r.profiles)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[days,demo,refresh]);
 const eligible=profiles.filter(hasPlacementAccess);
 return <section className="creator-insights" aria-labelledby="insights-title">
  <div className="dashboard-heading"><div><h2 id="insights-title">Co ti FameRiser přináší</h2><p>Soukromé statistiky tvých ověřených profilů s placeným nebo promo umístěním.</p></div><Button variant="outline" disabled={demo||busy} onClick={()=>setRefresh(n=>n+1)}>Obnovit</Button></div>
  <Tabs value={days} onValueChange={setDays}><TabsList className="insights-periods">{[['1','24 hodin'],['7','7 dní'],['30','30 dní'],['0','Celkově']].map(([v,label])=><TabsTrigger key={v} value={v}>{label}</TabsTrigger>)}</TabsList></Tabs>
  <p className="subtle-note">Měříme jen návštěvy se souhlasem. Přihlášeného majitele a známé roboty vynecháváme. Kliknutí znamená otevření odkazu, nepotvrzuje načtení sociální sítě ani nového sledujícího.</p>
  {demo&&<p className="notice">Ukázka rozložení. Skutečná návštěvnost se v demu neměří.</p>}
  {error&&<p role="alert" className="form-error">{error}</p>}
  {busy&&<p role="status">Načítání statistik…</p>}
  {!busy&&!error&&!eligible.length&&<p className="notice">Statistiky budou dostupné po ověření profilu a získání placeného nebo promo umístění.</p>}
  {!busy&&!error&&eligible.map(p=>{const r=rows.find(r=>r.profile_id===p.id);const metric=(v:number|undefined)=>demo?'—':r?number(v||0):'—';return <article className="insight-profile" key={p.id}>
   <h3>{p.name} <small>· {p.platform}</small></h3>{p.promo_granted_at&&<p className="subtle-note">Promo umístění · všechny funkce včetně statistik bez omezení.</p>}
   <div className="name-exposure-metric"><div><span>Zobrazení jména v žebříčku</span><strong>{metric(r?.name_views)}</strong></div><p>Celé jméno bylo na obrazovce alespoň 1 sekundu v aktivní kartě prohlížeče. Kliknutí není potřeba.</p><small>Odhad denních unikátních návštěvníků: {metric(r?.daily_name_viewers)}. Návštěvník v různých dnech se počítá znovu.</small></div>
   <div className="metric-grid traffic-metrics">
    <div><span>Stránka s tvým umístěním</span><strong>{metric(r?.board_views)}</strong><small>Načtení TOP 10 nebo stránky po 100, která obsahuje tvůj profil.</small></div>
    <div><span>Zobrazení karty</span><strong>{metric(r?.impressions)}</strong><small>Alespoň polovina karty byla vidět na obrazovce.</small></div>
    <div><span>Návštěvy detailu</span><strong>{metric(r?.detail_views)}</strong><small>Otevření tvého profilu uvnitř FameRiser.</small></div>
    <div><span>Prokliky na sociální síť</span><strong>{metric(r?.clicks)}</strong><small>Otevření odkazu „Navštívit profil“.</small></div>
   </div>
   <p className="insight-secondary">Odhad denních unikátních návštěvníků, kteří klikli: <strong>{metric(r?.daily_clickers)}</strong>. Stejný návštěvník v různých dnech se počítá znovu.</p>
   {!demo&&r&&r.daily.length>0&&<details><summary>Denní přehled za posledních 30 dní</summary><div className="insight-table"><table><caption>Zaznamenané události, den podle UTC</caption><thead><tr><th>Datum</th><th>Zobrazení jména</th><th>Zobrazení karty</th><th>Prokliky</th></tr></thead><tbody>{[...r.daily].reverse().map(d=><tr key={d.day}><td>{new Date(d.day).toLocaleDateString('cs-CZ',{timeZone:'UTC'})}</td><td>{number(d.name_views||0)}</td><td>{number(d.impressions)}</td><td>{number(d.clicks)}</td></tr>)}</tbody></table></div></details>}
  </article>})}
  <p className="subtle-note">Zobrazení jména měříme až od zavedení této funkce; starší zobrazení stránek za něj nepovažujeme. Jednotlivé metriky se překrývají a nesčítají se. Období jsou klouzavá. Opakované odeslání stejné události se nezapočítá dvakrát; nové otevření stránky ano. Starší data před zavedením tohoto měření obsahují nejvýše jednu událost návštěvníka za den. Údaje nejsou nezávislým auditem návštěvnosti.</p>
 </section>
}
