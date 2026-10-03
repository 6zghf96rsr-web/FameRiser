"use client";
import { ProfileCountry } from "./profile-country";
import {placementSummary,rankingSummary} from "@/lib/rankme/config";
import { useState } from "react";
import {
  ArrowUpRight,
  Crown,
  Eye,
  MousePointer2,
  CalendarDays,
  Flag,
  ShieldCheck,
  Trophy,
  Diamond,
  Share2,
  Check,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { VisitProfile } from "./visit-profile";
import { categoryLabel, countryLabel, languageLabel } from "@/lib/rankme/discovery";
import { Profile, Settings, money, number, orderProfiles } from "@/lib/rankme/config";
import { leaderboardPath } from "@/lib/rankme/leaderboards";
import { Avatar, PlatformIcon } from "./board";
import { JoinDialog } from "./join-form";
import { ProfileReviews } from "./profile-reviews";
import { useProfileTracking } from "./profile-tracking";
export function ProfileDetail({
  profile: p,
  profiles,
  settings,
  history,
  demo,
}: {
  profile: Profile;
  profiles: Profile[];
  settings: Settings;
  history: any[];
  demo: boolean;
}) {
  const [join, setJoin] = useState(false);
  const reportURL = `/report?url=${encodeURIComponent(`https://fameriser.com/p/${p.slug}`)}`;
  useProfileTracking([p.id], demo, "profile", p.id, true);
  const badges = [
    ...(p.rank === 1 || history.some((h) => h.new_rank === 1)
      ? [{ icon: Crown, label: "Dosáhl #1 · Most Famous", class: "gold" }]
      : []),
    ...(Number(p.rank) <= 10 || history.some((h) => h.new_rank <= 10)
      ? [{ icon: Trophy, label: "Most Famous: Top 10", class: "blue" }]
      : []),
    ...((p.placement_totals?.CZK || 0) >= 1000000
      ? [{ icon: Diamond, label: "10 000 Kč+", class: "purple" }]
      : []),
  ];
  const networkRank = orderProfiles(profiles, "all", p.platform).find((profile) => profile.id === p.id)?.rank;
  const countryRank = p.country ? orderProfiles(profiles.filter(x=>x.country===p.country)).find(x=>x.id===p.id)?.rank : null;
  return (
    <>
      <div className="profile-detail-card network-theme" data-network={p.platform.toLowerCase()}>
        <div className="profile-cover">
          <span>SPOLEČNÝ ŽEBŘÍČEK</span>
          <strong>#{p.rank}</strong>
        </div>
        <div className="profile-detail-body">
          <Avatar p={p} size="detail" />
          <div className="profile-top-actions">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Možnosti profilu"><MoreHorizontal size={19}/></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem asChild><a href={reportURL}><Flag size={16}/> Nahlásit profil</a></DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="icon"
              aria-label="Sdílet profil"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(location.href);
                  toast.success("Odkaz na profil je zkopírovaný.");
                } catch {
                  toast("Odkaz můžeš zkopírovat z adresního řádku.");
                }
              }}
            >
              <Share2 size={17} />
            </Button>
            <VisitProfile profile={p} demo={demo} className="profile-visit" />
          </div>
          <h2 className="profile-name-with-country">
            <span>{p.name}</span><ProfileCountry country={p.country}/>
            {p.verified && (
              <ShieldCheck size={22} aria-label="Ověřený profil" />
            )}
          </h2>
          <div className="profile-handle">
            @{p.username}
            <span>·</span>
            <PlatformIcon name={p.platform} />
            {p.platform}
            <span>·</span>
            <a href={`/category/${p.category.toLowerCase()}`}>{categoryLabel(p.category)}</a>
          </div>
          <div className="profile-about"><h3>O tvorbě</h3><p className="profile-bio">{p.bio || p.social_bio || 'Tvůrce zatím nepřidal popis.'}</p></div>
          {p.social_bio && p.social_bio !== p.bio && <div className="profile-about"><h3>Bio ze sítě {p.platform} · načtené při propojení</h3><p className="profile-bio">{p.social_bio}</p></div>}
          <div className="profile-location">{p.language && <span>{languageLabel(p.language)}</span>}{p.country && <span>{countryLabel(p.country)}</span>}{p.region && <span>{p.region}</span>}</div>
          <nav className="profile-ranks" aria-label="Umístění profilu v žebříčcích">
            <a href={leaderboardPath(p.platform)}><strong>#{networkRank}</strong> v síti {p.platform}</a>
            <a href="/"><strong>#{p.rank}</strong> v Most Famous</a>
            {countryRank&&<a href={`/?country=${encodeURIComponent(p.country!)}#leaderboard`}><strong>#{countryRank}</strong> · {countryLabel(p.country!)}</a>}
          </nav>
          <div className="profile-badges">
            <span>{p.verified ? "Vlastnictví ověřeno" : "Neověřeno"}</span>
            {badges.map((b) => (
              <span key={b.label} className={b.class}>
                <b.icon size={14} />
                {b.label}
              </span>
            ))}
            <span>Reklamní umístění</span>{demo && <span>Fiktivní profil</span>}
          </div>
          <div className="profile-stats">
            <div>
              <span>
                <Crown size={16} />
                Most Famous
              </span>
              <strong>#{p.rank}</strong>
            </div>
            <div>
              <span>
                <Diamond size={16} />
                Hodnota umístění
              </span>
              <strong>{placementSummary(p)}</strong>{p.rank_score!=null&&<small>{rankingSummary(p)}</small>}
            </div>
            <div>
              <span>
                <Eye size={16} />
                Zobrazení
              </span>
              <strong>{number(p.views)}</strong>
            </div>
            <div>
              <span>
                <MousePointer2 size={16} />
                Návštěvy sítě
              </span>
              <strong>{number(p.clicks)}</strong>
            </div>
          </div>
          <div className="profile-bottom">
            <span>
              <CalendarDays size={15} />V žebříčku od{" "}
              {new Date(p.created_at).toLocaleDateString("cs-CZ")}
            </span>
            <Button variant="ghost" onClick={() => setJoin(true)}>Zvýšit viditelnost <ArrowUpRight size={16} /></Button>
          </div>
        </div>
      </div>
      <ProfileReviews id={p.id} slug={p.slug} demo={demo} />
      <div className="profile-history">
        <h2>Cesta žebříčkem Most Famous</h2>
        <p>Každý posun má svůj příběh.</p>
        {history.length ? (
          <ol>
            {history.map((h, i) => (
              <li key={i}>
                <span className="timeline-point" />
                <div>
                  <strong>
                    {h.old_rank
                      ? `Posun #${h.old_rank} → #${h.new_rank}`
                      : `Vstup na #${h.new_rank}`}
                  </strong>
                  <small>
                    {new Date(h.created_at).toLocaleString("cs-CZ")}
                  </small>
                </div>

              </li>
            ))}
          </ol>
        ) : (
          <div className="notice">
            {demo
              ? "Historie tohoto fiktivního profilu není měřená. U skutečných profilů zde uvidíš každý zaznamenaný posun."
              : "Historie se začne zaznamenávat po první potvrzené platbě."}
          </div>
        )}
      </div>
      <div className="profile-disclaimer">
        <p>Pořadí určuje RankScore z plateb a přidělených kreditů.</p>
        <Button variant="ghost" asChild><a href={reportURL}><Flag size={14} /> Nahlásit profil</a></Button>
      </div>
      <JoinDialog
        open={join}
        onOpenChange={setJoin}
        profiles={profiles}
        settings={settings}
        demo={demo}
        amount={p.total_paid + settings.increment}
      />

    </>
  );
}
