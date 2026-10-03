"use client";
import { useState } from "react";
import { BadgeCheck, Clock3, Search, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageShell } from "./shell";
import { SignaturePodium } from "./signature-podium";
import { facebookDemoProfiles, facebookDemoLeaderboard } from "@/lib/rankme/facebook-demo";
import { categoryLabel, normalizeText } from "@/lib/rankme/discovery";
import type { Profile } from "@/lib/rankme/config";
import styles from "./facebook-demo.module.css";

function Status({ profile }: { profile: Profile }) {
  return <span className={profile.verified ? styles.verified : styles.pending}>
    {profile.verified ? <BadgeCheck size={16} /> : <Clock3 size={16} />}
    {profile.verified ? "Ověřeno · demo" : "Neověřeno"}
  </span>;
}
export function FacebookDemo() {
  const [view, setView] = useState("leaderboard");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);
  const source = view === "leaderboard" ? facebookDemoLeaderboard : view === "unverified" ? facebookDemoProfiles.filter(p => !p.verified) : facebookDemoProfiles;
  const shown = source.filter(p => normalizeText(`${p.name} ${p.username} ${categoryLabel(p.category)} ${p.bio}`).includes(normalizeText(query)));
  const rank = (p: Profile) => facebookDemoLeaderboard.find(item => item.id === p.id)?.rank;
  return <PageShell wide title="Facebook Fame" eyebrow="Oddělený testovací náhled" description="100 fiktivních profilů pro vyzkoušení žebříčku a zobrazení účtů.">
    <div className={styles.preview}>
      <aside className={styles.notice}><FlaskConical size={22} aria-hidden="true" /><p><strong>Všechny profily na této stránce jsou smyšlené.</strong> Ověření i promo umístění jsou pouze ukázková. Skutečné účty, statistiky, platby a volná promo místa zůstávají beze změny.</p></aside>
      <div className={styles.stats} aria-label="Počty testovacích účtů"><div><strong>100</strong><span>fiktivních účtů</span></div><div><strong>50</strong><span>ověřených v ukázce</span></div><div><strong>50</strong><span>neověřených mimo žebříček</span></div></div>
      <Tabs value={view} onValueChange={setView}>
        <TabsList className={styles.tabs} aria-label="Zobrazení testovacích profilů">
          <TabsTrigger value="leaderboard">Žebříček · 50</TabsTrigger>
          <TabsTrigger value="all">Všechny účty · 100</TabsTrigger>
          <TabsTrigger value="unverified">Neověřené · 50</TabsTrigger>
        </TabsList>
        <TabsContent value="leaderboard">
          <p className={styles.help}>Ukázka promo pořadí: všech 50 profilů má zaplaceno 0 Kč. Rozhoduje čas ukázkového přidání. Neověřené účty do žebříčku nevstupují.</p>
          <SignaturePodium profiles={facebookDemoLeaderboard.slice(0, 3)} demo period="all" filtered={false} onProfileSelect={setSelected} rankingCaption="Ukázkové promo · pořadí podle přidání" />
        </TabsContent>
        <TabsContent value="all"><p className={styles.help}>Přehled všech testovacích účtů. Umístění mají pouze ukázkově ověřené profily.</p></TabsContent>
        <TabsContent value="unverified"><p className={styles.help}>Tyto profily čekají na ověření. Jsou viditelné pouze v tomto testovacím přehledu.</p></TabsContent>
      </Tabs>
      <label className={styles.search}><Search size={19} aria-hidden="true" /><span className="sr-only">Vyhledat testovací profil podle jména nebo kategorie</span><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Hledat jméno nebo kategorii…" type="search" /></label>
      <p className={styles.count} role="status">Zobrazeno {shown.length} z {source.length} profilů</p>
      <div className={styles.list}>
        {shown.map(p => <article className={styles.row} key={p.id}>
          <span className={styles.rank} aria-label={rank(p) ? `Pořadí ${rank(p)}` : "Bez umístění"}>{rank(p) ? `#${rank(p)}` : "—"}</span>
          <span className={styles.avatar} aria-hidden="true">{p.name.split(" ").map(n => n[0]).join("")}</span>
          <div className={styles.person}><button onClick={() => setSelected(p)}>{p.name}</button><span>@{p.username}</span><p>{categoryLabel(p.category)} · Facebook</p></div>
          <Status profile={p} />
          <div className={styles.amount}><strong>0 Kč</strong><span>{p.verified ? "Ukázkové promo" : "Mimo žebříček"}</span></div>
          <Button variant="outline" onClick={() => setSelected(p)} aria-label={`Zobrazit testovací profil ${p.name}`}>Detail</Button>
        </article>)}
        {shown.length === 0 && <p className={styles.empty}>Žádný testovací profil neodpovídá hledání. <button onClick={() => setQuery("")}>Vymazat hledání</button></p>}
      </div>
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className={styles.detail}>
          {selected && <>
            <span className={styles.detailLabel}>FIKTIVNÍ FACEBOOK PROFIL</span>
            <DialogTitle>{selected.name}</DialogTitle>
            <DialogDescription>@{selected.username} · {categoryLabel(selected.category)}</DialogDescription>
            <Status profile={selected} /><p>{selected.bio}</p>
            <dl><div><dt>Umístění v ukázce</dt><dd>{rank(selected) ? `#${rank(selected)}` : "Mimo žebříček"}</dd></div><div><dt>Celkem zaplaceno</dt><dd>0 Kč</dd></div><div><dt>Přidáno v ukázce</dt><dd>{new Intl.DateTimeFormat("cs-CZ", {dateStyle:"medium", timeStyle:"short", timeZone:"Europe/Prague"}).format(new Date(selected.created_at))}</dd></div></dl>
            <p className={styles.help}>Tento profil nemá skutečný účet na Facebooku. Zobrazený stav ověření slouží pouze k testování; přihlášení ani ověření neproběhlo.</p>
            <Button onClick={() => setSelected(null)}>Zpět na testovací přehled</Button>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  </PageShell>;
}
