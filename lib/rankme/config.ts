export const APP = {
  name: "FameRiser",
  tagline: "Pay. Rank. Get Seen.",
  currency: "CZK",
  minimum: 10000,
  increment: 1000,
} as const;
export const platforms = [
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
  "Twitch",
  "X",
] as const;
// Retained for the future catalog; these networks cannot accept new profiles yet.
export const deferredPlatforms = [
  "LinkedIn",
  "Threads",
  "Snapchat",
  "Pinterest",
  "Kick",
  "Reddit",
  "Jiná",
] as const;
export const allPlatforms = [...platforms, ...deferredPlatforms] as const;
// Product requirement for the future DM integration, not an active sender.
export const dmCodeValidityHours = 24;
export const categories = [
  "Creators",
  "Influencers",
  "Gamers",
  "Streamers",
  "Music",
  "Models",
  "Business",
  "Developers",
  "Artists",
  "Fitness",
  "Lifestyle",
  "Photography",
  "Comedy",
  "Other",
] as const;
export type Profile = {
  id: string;
  user_id?: string;
  name: string;
  username: string;
  slug: string;
  bio: string;
  social_bio?: string | null;
  language?: string | null;
  country?: string | null;
  region?: string | null;
  avatar_url: string | null;
  platform: string;
  category: string;
  social_url: string;
  placement_totals?: Record<string,number>; placement_active?: boolean;
  ranking_periods?: readonly string[]; public_rank_values?: Record<string,number>; public_rank_times?: Record<string,string>;
  total_paid: number;
  rank_score?:number|null; today_score?:number; week_score?:number; month_score?:number; paid_totals?:Record<string,number>;
  promo_granted_at?: string | null;
  promo_credit_minor?: number; promo_credit_currency?: string; promo_credit_score?: number;
  promo_credit_granted_at?: string; promo_priority_at?: string; promo_slot?: number;
  reached_amount_at: string;
  registration_at?: string;
  created_at: string;
  status: string;
  payment_required?: boolean;
  verified: boolean;
  views: number;
  clicks: number;
  today_paid: number;
  today_reached_at?: string;
  week_paid?: number;
  week_reached_at?: string;
  month_paid?: number;
  month_reached_at?: string;
  demo?: boolean;
  rank?: number;
};
export type Settings = { name: string; minimum: number; increment: number; promo_enabled?: boolean };
export function hasPlacementAccess(p: Profile) {
  return (p.demo === true || p.verified === true) && p.status !== "deleted" && (p.placement_active === true || p.total_paid > 0 || (p.rank_score||0)>0 || !!p.promo_granted_at);
}
export const money = (minor: number) =>
  new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(minor / 100);
export const number = (value: number) =>
  new Intl.NumberFormat("cs-CZ").format(value);
export const periods = ["all", "today", "week", "month"] as const;
export const periodLabel = (period: string) => ({all:"Celkově", today:"24 hodin", week:"7 dní", month:"30 dní"}[period] || "Celkově");
export function periodAmount(p: Profile, period = "all") {
  return period === "today" ? p.today_paid : period === "week" ? p.week_paid || 0 : period === "month" ? p.month_paid || 0 : p.total_paid;
}
export function periodReached(p: Profile, period = "all") {
  return (period === "today" ? p.today_reached_at : period === "week" ? p.week_reached_at : period === "month" ? p.month_reached_at : null) || p.reached_amount_at;
}
export function orderProfiles(profiles: Profile[], period = "all", platform = "all") {
  return [...profiles]
    .filter(p => p.status === "active" && hasPlacementAccess(p) &&
      (platform === "all" || p.platform === platform) && (p.ranking_periods ? p.ranking_periods.includes(period) : periodScore(p, period) > 0 || !!p.promo_granted_at))
    .sort((a,b) => periodScore(b, period) - periodScore(a, period) ||
      Date.parse(rankingReached(a,period)) - Date.parse(rankingReached(b,period)) || Date.parse(a.created_at)-Date.parse(b.created_at) || a.id.localeCompare(b.id))
    .map((p,i) => ({...p,rank:i+1}));
}
export function targetAmount(
  profiles: Profile[],
  rank: number,
  minimum: number = APP.minimum,
  increment: number = APP.increment,
  exclude?: string,
) {
  const sorted = orderProfiles(profiles.filter((p) => p.id !== exclude));
  return Math.max(
    minimum,
    (sorted[rank - 1]?.total_paid ?? minimum - increment) + increment,
  );
}
export function estimateRank(
  profiles: Profile[],
  amount: number,
  exclude?: string,
) {
  return (
    profiles.filter(
      (p) =>
        p.status === "active" &&
        hasPlacementAccess(p) &&
        p.id !== exclude &&
        p.total_paid >= amount,
    ).length + 1
  );
}

export function periodScore(p:Profile,period='all'){if(p.public_rank_values)return p.public_rank_values[period]||0;if(p.rank_score==null)return periodAmount(p,period);return period==='today'?p.today_score||0:period==='week'?p.week_score||0:period==='month'?p.month_score||0:p.rank_score;}
export function paidSummary(p:Profile){const totals={...p.paid_totals};if(p.total_paid)totals.CZK=(totals.CZK||0)+p.total_paid;return Object.entries(totals).filter(([,n])=>n>0).map(([currency,n])=>new Intl.NumberFormat('cs-CZ',{style:'currency',currency}).format(n/(currency==='JPY'?1:100))).join(' + ')||'0 Kč';}
export function rankingSummary(p:Profile,period='all'){return p.rank_score==null?money(periodScore(p,period)):`${new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:4}).format(periodScore(p,period)/1e6)} RankScore`;}
export function placementLabel(p:Profile){return hasPaidPlacement(p)?'Placené reklamní umístění':'Promo umístění zdarma';}

export function combinedPaidSummary(profiles:Profile[]){const totals:Record<string,number>={};for(const p of profiles){for(const [c,n] of Object.entries(p.paid_totals||{}))totals[c]=(totals[c]||0)+n;if(p.total_paid)totals.CZK=(totals.CZK||0)+p.total_paid;}return paidSummary({total_paid:0,paid_totals:totals} as Profile);}

export function promoSummary(p:Profile){return (p.promo_credit_minor||0)>0 ? `Promo kredit ${new Intl.NumberFormat('cs-CZ',{style:'currency',currency:p.promo_credit_currency||'USD',currencyDisplay:'code',maximumFractionDigits:0}).format(p.promo_credit_minor!/100)} zdarma` : '';}
export function hasPaidPlacement(p:Profile){return p.total_paid>0 || Object.values(p.paid_totals||{}).some(n=>n>0) || (p.rank_score||0)>(p.promo_credit_score||0);}
export function rankingReached(p:Profile,period='all'){
 if(p.public_rank_times)return p.public_rank_times[period]||p.reached_amount_at;
 if(p.registration_at)return p.registration_at;
 if(p.promo_priority_at && !hasPaidPlacement(p)) return p.promo_priority_at;
 return periodScore(p,period)===0&&p.promo_granted_at ? p.promo_granted_at : periodReached(p,period);
}

export function placementTotals(p:Profile){
 if(p.placement_totals)return {...p.placement_totals};
 const totals={...p.paid_totals};
 if(p.total_paid)totals.CZK=(totals.CZK||0)+p.total_paid;
 if(p.promo_credit_minor){const currency=p.promo_credit_currency||'USD';totals[currency]=(totals[currency]||0)+p.promo_credit_minor;}
 return totals;
}
function formatPlacementTotals(totals:Record<string,number>){return Object.entries(totals).filter(([,n])=>n>0).map(([currency,n])=>new Intl.NumberFormat('cs-CZ',{style:'currency',currency,currencyDisplay:currency==='USD'?'code':'symbol',maximumFractionDigits:currency==='JPY'?0:2}).format(n/(currency==='JPY'?1:100))).join(' + ')||'0 Kč';}
export function placementSummary(p:Profile){return formatPlacementTotals(placementTotals(p));}
export function combinedPlacementSummary(profiles:Profile[]){const totals:Record<string,number>={};for(const p of profiles)for(const [currency,n] of Object.entries(placementTotals(p)))totals[currency]=(totals[currency]||0)+n;return formatPlacementTotals(totals);}
