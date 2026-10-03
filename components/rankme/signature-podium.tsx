"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Pause, Play, Trophy, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Profile, placementSummary,  rankingSummary, periodLabel } from "@/lib/rankme/config";
import { categoryLabel } from "@/lib/rankme/discovery";
import { VisitProfile } from "./visit-profile";
import { ProfileCountry } from "./profile-country";

type Scene = { dispose(): void; setMotion(value: boolean): void; setTurn(value: number): void; highlight(index: number, active: boolean): void };

export function SignaturePodium({ profiles, demo, period, filtered, onProfileSelect, rankingCaption }: { profiles: Profile[]; demo: boolean; period: string; filtered: boolean; onProfileSelect?: (profile: Profile) => void; rankingCaption?: string }) {
  const surface = useRef<HTMLDivElement>(null), canvas = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null), motionValue = useRef(false);
  const [compact, setCompact] = useState(false), [showPodium,setShowPodium] = useState(false);
  const spatial=showPodium&&!compact;
  useEffect(() => {
    const media = matchMedia("(max-width:700px)");
    const update = () => setCompact(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [ready, setReady] = useState(false), [motion, setMotion] = useState(false), [turn, setTurn] = useState(0);
  const people = useMemo(() => [profiles[1] || null, profiles[0] || null, profiles[2] || null], [profiles]);
  const sceneKey = people.map(p => `${p?.id || "empty"}:${p?.rank || 0}`).join("|");

  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { motionValue.current = !preference.matches; setMotion(!preference.matches); };
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let cancelled = false, controller: Scene | undefined;
    setReady(false); setTurn(0);
    const host = canvas.current, stage = surface.current;
    if (!host || !stage || !spatial) return;
    import("./podium-scene.js").then(({ mountPodium }) => {
      if (cancelled) return;
      controller = mountPodium({ host, surface: stage, cards: Array.from(stage.querySelectorAll<HTMLElement>(".signature-person")), people, motion: motionValue.current, onReady: (value: boolean) => { if (!cancelled) setReady(value); } });
      scene.current = controller;
    }).catch(() => { if (!cancelled) setReady(false); });
    return () => { cancelled = true; controller?.dispose(); scene.current = null; };
    // The scene owns only positions and ranks. Names, photos and amounts stay in React.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, spatial]);
  useEffect(() => { motionValue.current = motion; scene.current?.setMotion(motion); }, [motion]);
  useEffect(() => { scene.current?.setTurn(turn); }, [turn]);

  return <section className="signature-stage" aria-label="Nejvýše umístěné profily" data-presentation={spatial?"spatial":"compact"} data-webgl={ready ? "ready" : "fallback"} data-motion={motion ? "on" : "off"}>
    <div className="signature-stage-heading"><span><Trophy size={17} aria-hidden="true" /> {filtered ? "Nejvýše ve výběru" : "Na stupních vítězů"}</span><div className="podium-view-choice"><small>{rankingCaption || "Pořadí podle RankScore"}</small><Button variant="ghost" className="podium-view-toggle" aria-pressed={showPodium} onClick={()=>setShowPodium(v=>!v)}>{showPodium?"Přehled profilů":"Prostorové pódium"}</Button></div></div>
    <div className="signature-scene" ref={surface}>
      <div className="signature-canvas" ref={canvas} aria-hidden="true" />
      <div className="signature-fallback" aria-hidden="true">{people.map((p, i) => <b key={i}>{p ? String(p.rank).padStart(2, "0") : "—"}</b>)}</div>
      <div className="signature-people">
        {(spatial?people:profiles).map((p, i) => p ? <article className="signature-person" key={p.id} data-profile-id={p.id} data-rank={p.rank}>
          <a href={onProfileSelect ? `#${p.id}` : `/p/${p.slug}`} onClick={onProfileSelect ? event => { event.preventDefault(); onProfileSelect(p); } : undefined} className="signature-person-link" onPointerEnter={() => scene.current?.highlight(i, true)} onPointerLeave={() => scene.current?.highlight(i, false)} onFocus={() => scene.current?.highlight(i, true)} onBlur={() => scene.current?.highlight(i, false)}>
            <span className="signature-medallion"><span className="signature-avatar">{p.avatar_url ? <img src={p.avatar_url} alt="" /> : p.name.split(" ").map(n => n[0]).slice(0, 2).join("")}</span></span>
            <span className="signature-label"><span className="signature-name-line"><span className="signature-name" data-profile-name-id={p.id}>{p.name}</span><ProfileCountry country={p.country}/></span><span className="signature-network">{p.platform} · #{p.rank}</span><strong className="signature-amount">{placementSummary(p).split(" + ").map((amount, n) => { const split = amount.lastIndexOf("\u00a0") >= 0 ? amount.lastIndexOf("\u00a0") : amount.lastIndexOf(" "); return <span className="signature-currency" key={n}>{n > 0 && <span>+ </span>}{split > 0 ? <><span>{amount.slice(0, split)}</span>{" "}<span>{amount.slice(split + 1)}</span></> : amount}</span>; })}</strong><span className="signature-placement">Hodnota umístění</span></span>
          </a>
          <p className="podium-creator-bio">{p.bio || p.social_bio || categoryLabel(p.category)}</p>
          <VisitProfile profile={p} demo={demo} className="podium-visit"/>
        </article> : <div className="signature-person is-empty" key={`empty-${i}`} aria-hidden="true" />)}
      </div>
    </div>
    <div className="signature-stage-controls"><span>{demo ? "Ukázkové profily · hodnota umístění" : "Hodnota umístění zahrnuje platby i přidělené kredity"}</span><div role="group" aria-label="Pohled na pódium">
      <Button size="icon" variant="ghost" disabled={!ready || turn <= -.3} aria-label="Otočit pódium doleva" onClick={() => setTurn(v => Math.max(-.3, v - .15))}><ChevronLeft size={16} /></Button>
      <Button size="icon" variant="ghost" disabled={!ready} aria-label="Vycentrovat pódium" onClick={() => setTurn(0)}><RotateCcw size={15} /></Button>
      <Button size="icon" variant="ghost" disabled={!ready || turn >= .3} aria-label="Otočit pódium doprava" onClick={() => setTurn(v => Math.min(.3, v + .15))}><ChevronRight size={16} /></Button>
      <Button variant="ghost" disabled={!ready} aria-pressed={motion} onClick={() => setMotion(v => !v)}>{motion ? <Pause size={14} /> : <Play size={14} />} Pohyb {motion ? "zapnutý" : "vypnutý"}</Button>
    </div></div>
    <details className="signature-details"><summary>Informace o profilech a umístění</summary><div className="signature-detail-grid">
      {profiles.map(p => <article key={p.id}><h3><span>#{p.rank}</span> <a href={onProfileSelect ? `#${p.id}` : `/p/${p.slug}`} onClick={onProfileSelect ? event => { event.preventDefault(); onProfileSelect(p); } : undefined}>{p.name} <ProfileCountry country={p.country}/> <ArrowUpRight size={14} /></a></h3><p>@{p.username} · {p.platform} · {categoryLabel(p.category)}</p><p>{p.bio || p.social_bio || "Tvůrce zatím nepřidal popis."}</p><strong>{placementSummary(p)}</strong><p>Reklamní umístění · hodnota umístění{(p.rank_score != null || period !== "all") && <> · {rankingSummary(p, period)}{period !== "all" && <> za {periodLabel(period)}</>}</>}</p><VisitProfile profile={p} demo={demo} /></article>)}
    </div></details>
  </section>;
}
