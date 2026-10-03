import {orderProfiles,periods,placementTotals,type Profile} from './config';
import {boardFilters,networkFromSlug} from './leaderboards';
import {filterProfiles,normalizeText} from './discovery';
export type BoardRequest={platform:string;period:string;category:string;query:string;full:boolean;page:number;language:string;country:string;region:string};
export type BoardMeta={page:number;pages:number;size:number;total:number;counts:Record<string,number>;facets:{languages:string[];countries:string[];regions:string[]};summary:{count:number;views:number;clicks:number;totals:Record<string,number>}};
export function boardRequest(input:Record<string,string|string[]|undefined>,platform='all'):BoardRequest{
 const f=boardFilters(input);
 return {platform:networkFromSlug(platform.toLowerCase())||'all',period:f.initialPeriod,category:f.initialCategory,query:f.initialQuery,full:f.initialFull,page:f.initialFull?f.initialPage:1,language:f.initialLanguage,country:f.initialCountry,region:f.initialRegion};
}
export function boardSearch(r:BoardRequest){const s=new URLSearchParams({platform:r.platform,period:r.period,category:r.category,query:r.query,view:r.full?'full':'top',page:String(r.page),language:r.language,country:r.country,region:r.region});return s.toString();}
export function demoBoardPage(profiles:Profile[],r:BoardRequest){
 const available=orderProfiles(profiles,r.period,r.platform),all=orderProfiles(profiles,'all',r.platform);
 const ranked=orderProfiles(r.country==='all'?profiles:profiles.filter(p=>p.country===r.country),r.period,r.platform);
 const filtered=filterProfiles(ranked,r),size=r.full?100:10,pages=Math.max(1,Math.ceil(filtered.length/size)),page=r.full?Math.min(r.page,pages):1;
 const totals:Record<string,number>={};for(const p of all)for(const [currency,amount] of Object.entries(placementTotals(p)))totals[currency]=(totals[currency]||0)+amount;
 const counts:Record<string,number>={all:orderProfiles(profiles,r.period).length};for(const p of orderProfiles(profiles,r.period))counts[p.platform]=(counts[p.platform]||0)+1;
 const unique=(values:(string|null|undefined)[])=>[...new Set(values.filter((v):v is string=>!!v))].sort();
 return {profiles:filtered.slice((page-1)*size,page*size),meta:{page,pages,size,total:filtered.length,counts,facets:{languages:unique(available.map(p=>p.language)),countries:unique(available.map(p=>p.country)),regions:unique(available.filter(p=>r.country==='all'||p.country===r.country).map(p=>p.region))},summary:{count:all.length,views:all.reduce((s,p)=>s+p.views,0),clicks:all.reduce((s,p)=>s+p.clicks,0),totals}} satisfies BoardMeta};
}
export const emptyBoardMeta=(r:BoardRequest):BoardMeta=>({page:1,pages:1,size:r.full?100:10,total:0,counts:{all:0},facets:{languages:[],countries:[],regions:[]},summary:{count:0,views:0,clicks:0,totals:{}}});
