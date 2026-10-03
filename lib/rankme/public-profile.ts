import {hasPlacementAccess,periods,periodScore,rankingReached,placementTotals,type Profile} from './config';

// Explicit public projection: neither the payment/promo split nor owner IDs
// reach HTML, React props or /api/leaderboard. Accounting stays server-side.
export function publicProfile(p:Profile):Profile {
 return {
  id:p.id,name:p.name,username:p.username,slug:p.slug,bio:p.bio,social_bio:p.social_bio,
  avatar_url:p.avatar_url,platform:p.platform,category:p.category,social_url:p.social_url,
  language:p.language,country:p.country,region:p.region,status:p.status,verified:p.verified,
  views:p.views,clicks:p.clicks,created_at:p.created_at,demo:p.demo,rank:p.rank,
  placement_totals:placementTotals(p),placement_active:hasPlacementAccess(p),
  ranking_periods:periods.filter(period=>periodScore(p,period)>0||!!p.promo_granted_at),
  public_rank_values:Object.fromEntries(periods.map(period=>[period,periodScore(p,period)])),
  public_rank_times:Object.fromEntries(periods.map(period=>[period,rankingReached(p,period)])),
  rank_score:p.rank_score, today_score:p.today_score,week_score:p.week_score,month_score:p.month_score,
  // Compatibility slots are intentionally empty, never public payment claims.
  total_paid:0,today_paid:0,reached_amount_at:rankingReached(p),
 };
}
