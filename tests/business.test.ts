import assert from "node:assert/strict";
import { test } from "node:test";
import { accountDisplayName } from "../lib/rankme/account-name";

test('account label uses the social profile name and never exposes login email', () => {
  assert.equal(accountDisplayName({user_metadata:{full_name:'Sample Creator',email:'private@example.com'}}), 'Sample Creator');
  assert.equal(accountDisplayName({user_metadata:{name:'private@example.com'},identities:[{identity_data:{name:'Petrovo studio'}}]}), 'Petrovo studio');
  assert.equal(accountDisplayName({user_metadata:{email:'private@example.com',full_name:'private@example.com',name:'Kontakt <private@example.com>'}}), 'Uživatel FameRiser');
  assert.equal(accountDisplayName({user_metadata:{display_name:42,name:'   '}}), 'Uživatel FameRiser');
  assert.equal(accountDisplayName({user_metadata:{name:'  Petra   Nová  '}}), 'Petra Nová');
});
import {
  orderProfiles,
  targetAmount,
  estimateRank,
} from "../lib/rankme/config";
import { demoProfiles } from "../lib/rankme/demo";
import { filterProfiles, pageProfiles, suggestCategory } from "../lib/rankme/discovery";
import { networkFromSlug, leaderboardPath, boardFilters } from "../lib/rankme/leaderboards";
import {
  accountURL,
  connectionInput,
  youtubeChannels,
  authReturnPath,
} from "../lib/rankme/connections";
import {
  safeSocialURL,
  checkoutInput,
  profileInput,
} from "../lib/rankme/validation";
test("ranking is determined by amount, then earlier time, never views", () => {
  const a = {
    ...demoProfiles[0],
    id: "a",
    total_paid: 50000,
    reached_amount_at: "2026-09-01T12:00:00Z",
    views: 0,
  };
  const b = {
    ...a,
    id: "b",
    reached_amount_at: "2026-09-01T13:00:00Z",
    views: 999999,
  };
  const c = { ...a, id: "c", total_paid: 50001 };
  assert.deepEqual(
    orderProfiles([b, a, c]).map((p) => p.id),
    ["c", "a", "b"],
  );
});
test("hidden profiles never affect rank estimates", () => {
  const profiles = [{ ...demoProfiles[0], status: "hidden" }, demoProfiles[1]];
  assert.equal(estimateRank(profiles, 1000000), 1);
  assert.equal(orderProfiles(profiles).length, 1);
});
test("outbid and empty board minimum are precise in minor units", () => {
  assert.equal(targetAmount(demoProfiles, 1), 1251000);
  assert.equal(targetAmount([], 1), 10000);
  assert.equal(
    targetAmount(demoProfiles, 1, 10000, 1000, demoProfiles[0].id),
    931000,
  );
  assert.equal(estimateRank(demoProfiles, 1250000), 2);
});
test("today uses 24-hour aggregate rather than lifetime total", () => {
  const sorted = orderProfiles(demoProfiles, "today");
  assert.equal(sorted[0].username, "nela.nova");
  assert(sorted.every((p) => p.today_paid > 0));
});
test("network boards rank independently and their union forms the shared board without merging owners", () => {
  const base = { ...demoProfiles[0], demo: false, verified: true, user_id: "same-owner", reached_amount_at: "2026-09-01T12:00:00Z" };
  const profiles = [
    { ...base, id: "a", platform: "Instagram", total_paid: 60000 },
    { ...base, id: "b", platform: "X", total_paid: 90000 },
    { ...base, id: "c", platform: "Instagram", total_paid: 20000 },
    { ...base, id: "private", platform: "Instagram", total_paid: 100000, verified: false },
    { ...base, id: "unpaid", platform: "X", total_paid: 0 },
  ];
  const shared = orderProfiles(profiles);
  const instagram = orderProfiles(profiles, "all", "Instagram");
  const x = orderProfiles(profiles, "all", "X");
  assert.deepEqual(shared.map((p) => [p.id, p.rank]), [["b", 1], ["a", 2], ["c", 3]]);
  assert.deepEqual(instagram.map((p) => [p.id, p.rank]), [["a", 1], ["c", 2]]);
  assert.deepEqual(x.map((p) => [p.id, p.rank]), [["b", 1]]);
  assert.deepEqual(orderProfiles([...instagram, ...x]), shared);
  assert.deepEqual(orderProfiles(profiles, "all", "Twitch"), []);
  assert.equal(targetAmount(instagram, 1), 61000);
  assert.equal(targetAmount(shared, 1), 91000);
  assert.equal(estimateRank(instagram, 61000), 1);
  assert.equal(estimateRank(shared, 61000), 2);
});
test("network Today ranks use payment time ties and ignore other networks and expired payments", () => {
  const base = { ...demoProfiles[0], total_paid: 100000, today_paid: 10000, today_reached_at: "2026-09-14T12:00:00Z" };
  const profiles = [
    { ...base, id: "b", platform: "X" },
    { ...base, id: "later", platform: "X", today_reached_at: "2026-09-14T13:00:00Z" },
    { ...base, id: "a", platform: "X" },
    { ...base, id: "expired", platform: "X", total_paid: 500000, today_paid: 0 },
    { ...base, id: "instagram", platform: "Instagram", today_paid: 20000 },
  ];
  assert.deepEqual(orderProfiles(profiles, "today", "X").map((p) => [p.id, p.rank]), [["a", 1], ["b", 2], ["later", 3]]);
  assert.equal(orderProfiles(profiles, "today")[0].id, "instagram");
  assert.equal(networkFromSlug("x"), "X");
  assert.equal(networkFromSlug("linkedin"), undefined);
  assert.equal(networkFromSlug("not-a-network"), undefined);
  assert.equal(leaderboardPath("YouTube"), "/network/youtube");
});
test("unsafe and disguised social URLs fail closed", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://instagram.com/name",
    "https://instagram.com.evil.example/name",
    "https://instagram.com@evil.example/name",
    "https://bit.ly/a",
    "https://127.0.0.1/name",
    "https://instagram.com/redirect?url=https://evil.example",
    "https://instagram.com/name?next=https://evil.example",
    "https://instagram.com:8080/name",
  ])
    assert.throws(() => safeSocialURL(url, "Instagram"), url);
  assert.equal(
    safeSocialURL("https://www.instagram.com/alex.pixel/", "Instagram"),
    "https://instagram.com/alex.pixel/",
  );
  assert.throws(() => safeSocialURL("https://unapproved.example/name", "Jiná"));
});
test("server input rejects privileged fields and fractional minor units", () => {
  assert.equal(
    checkoutInput.safeParse({
      profile_id: crypto.randomUUID(),
      target_total: 10000.1,
      accepted: true,
      request_id: crypto.randomUUID(),
    }).success,
    false,
  );
  assert.equal(
    profileInput.safeParse({
      name: "Alex",
      username: "alex",
      bio: "",
      platform: "Instagram",
      category: "Creators",
      social_url: "https://instagram.com/alex",
      ownership: true,
      privacy: true, non_political:true,
      total_paid: 999999,
      verified: true,
    }).success,
    false,
  );
});
test("connection URLs normalize tracking and aliases but reject posts", () => {
  assert.equal(
    accountURL("https://www.instagram.com/My.Account/?igsh=test", "Instagram"),
    "https://instagram.com/my.account",
  );
  assert.equal(
    accountURL("https://twitter.com/Me/?s=20", "X"),
    "https://x.com/me",
  );
  assert.equal(
    accountURL(
      "https://facebook.com/profile.php?id=123&tracking=x",
      "Facebook",
    ),
    "https://facebook.com/profile.php?id=123",
  );
  for (const [url, platform] of [
    ["https://youtube.com/watch?v=123", "YouTube"],
    ["https://instagram.com/p/post", "Instagram"],
    ["https://tiktok.com/@me/video/123", "TikTok"],
    ["https://instagram.com/%2e%2e/reels", "Instagram"],
    ["https://x.com/home", "X"],
    ["https://facebook.com/profile.php", "Facebook"],
  ])
    assert.throws(() => accountURL(url, platform));
});
test("ownership cannot be self-attested as verified and OAuth channels use provider IDs", () => {
  assert.equal(
    connectionInput.safeParse({
      platform: "Instagram",
      social_url: "https://instagram.com/me",
      ownership: true,
      verified: true,
    }).success,
    false,
  );
  const channel = "UC" + "a".repeat(22);
  assert.deepEqual(
    youtubeChannels({
      items: [
        {
          id: channel,
          snippet: { title: "My channel" },
          social_url: "https://evil.example",
        },
      ],
    }),
    [
      {
        remote_id: channel,
        label: "My channel",
        social_url: `https://youtube.com/channel/${channel}`,
        social_bio:"", avatar_url:null, suggested_country:null, suggested_language:null,
      },
    ],
  );
  assert.throws(() => youtubeChannels({ items: [] }));
  assert.throws(() =>
    youtubeChannels({
      items: [{ id: "../../other", snippet: { title: "No" } }],
    }),
  );
});
test("auth callback accepts only intended local destinations", () => {
  const instagramPath = "/join?instagram=01234567-89ab-4cde-8fab-0123456789ab";
  assert.equal(authReturnPath(instagramPath), instagramPath);
  assert.equal(authReturnPath(instagramPath + "&next=https://evil.example"), "/dashboard");
  assert.equal(authReturnPath("/join?instagram=not-an-id"), "/dashboard");
  assert.equal(authReturnPath("/connections"), "/connections");
  assert.equal(authReturnPath("/p/alex-pixel"), "/p/alex-pixel");
  for (const value of [
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "/connections?next=https://evil.example",
    null,
  ])
    assert.equal(authReturnPath(value), "/dashboard");
});
test("zero-value profiles cannot appear in public ordering, even when marked active", () => {
  const unpaid = {
    ...demoProfiles[0],
    total_paid: 0,
    today_paid: 0,
    status: "active",
  };
  assert.equal(orderProfiles([unpaid]).length, 0);
  assert.equal(estimateRank([unpaid], 0), 1);
});

test("real unverified accounts cannot enter either board or inflate position prices", () => {
  const unverified = { ...demoProfiles[0], demo: false, verified: false, today_paid: 9999999, total_paid: 9999999 };
  assert.equal(orderProfiles([unverified]).length, 0);
  assert.equal(orderProfiles([unverified], "today").length, 0);
  assert.equal(estimateRank([unverified], 10000), 1);
  assert.equal(targetAmount([unverified], 1), 10000);
  assert.equal(orderProfiles([{ ...unverified, verified: true }]).length, 1);
});

test("deferred networks cannot create connections or listings while their existing URLs remain valid", () => {
  const input = { name: "Test Person", username: "test.person", bio: "", category: "Creators", ownership: true, privacy: true, non_political:true };
  for (const [platform, social_url] of [
    ["LinkedIn", "https://linkedin.com/in/test-person"],
    ["Kick", "https://kick.com/testperson"],
  ]) {
    assert.doesNotThrow(() => accountURL(social_url, platform));
    assert.equal(connectionInput.safeParse({ platform, social_url, ownership: true }).success, false);
    assert.equal(profileInput.safeParse({ ...input, platform, social_url }).success, false);
  }
  for (const [platform, social_url] of [
    ["Facebook", "https://facebook.com/profile.php?id=123"],
    ["Facebook", "https://facebook.com/our.page"],
    ["X", "https://x.com/testperson"],
    ["X", "https://twitter.com/testperson"],
  ]) {
    assert.doesNotThrow(() => accountURL(social_url, platform));
    assert.equal(connectionInput.safeParse({ platform, social_url, ownership: true }).success, true);
    assert.equal(profileInput.safeParse({ ...input, platform, social_url }).success, true);
  }
});


test("discovery overview and 100-row pages preserve every rank without duplicates", () => {
  const profiles = Array.from({length:205}, (_,i) => ({...demoProfiles[0],id:`sample-${i}`,total_paid:100000-i}));
  const ranked = orderProfiles(profiles);
  assert.equal(pageProfiles(ranked,false,10).items.length,10);
  const first = pageProfiles(ranked,true,1), second = pageProfiles(ranked,true,2), third = pageProfiles(ranked,true,3);
  assert.deepEqual([first.items.length,second.items.length,third.items.length],[100,100,5]);
  assert.equal(second.items[0].rank,101);
  assert.equal(third.items.at(-1)?.rank,205);
  assert.equal(new Set([...first.items,...second.items,...third.items].map(p=>p.id)).size,205);
  assert.equal(pageProfiles(ranked,true,999).page,3);
  assert.equal(pageProfiles([],true,-1).page,1);
});
test("discovery combines metadata filters, Czech search and real ranking positions", () => {
  const profiles=orderProfiles(demoProfiles.map((p,i)=>({...p,language:i%2?'sk':'cs',country:i%2?'SK':'CZ',region:i%2?'Bratislava':'Praha'})));
  const base={query:'',category:'all',language:'all',country:'all',region:''};
  const result=filterProfiles(profiles,{...base,language:'cs',country:'CZ',region:'praha'});
  assert(result.every(p=>p.language==='cs' && p.country==='CZ'));
  assert.equal(result[1].rank,3);
  assert.equal(filterProfiles(profiles,{...base,query:'fotografove'})[0].category,'Photography');
  assert.equal(filterProfiles(profiles,{...base,language:'ja'}).length,0);
  assert.equal(filterProfiles(profiles,{...base,country:'CZ',region:'Bratislava'}).length,0);
  assert.equal(boardFilters({view:'full',page:'2',language:'cs',country:'CZ',region:'Praha'}).initialPage,2);
  assert.equal(boardFilters({page:'NaN',language:'invalid'}).initialPage,1);
});
test("category hints use available descriptions and leave unknown work unclassified",()=>{
  assert.equal(suggestCategory('Jsem fotograf a fotím svatby'),'Photography');
  assert.equal(suggestCategory('Fitness trenér a výživa'),'Fitness');
  assert.equal(suggestCategory('Malíř obrazů'),'Artists');
  assert.equal(suggestCategory('Ahoj světe'),null);
});
test("provider metadata is optional and HTTPS photos are retained from the provider",()=>{
 const [channel]=youtubeChannels({items:[{id:'UC'+'b'.repeat(22),snippet:{title:'Photographer',description:'My photos',defaultLanguage:'cs-CZ',country:'CZ',thumbnails:{high:{url:'https://yt3.googleusercontent.com/example'}}}}]});
 assert.equal(channel.social_bio,'My photos'); assert.equal(channel.suggested_language,'cs');
 assert.equal(channel.suggested_country,'CZ'); assert.equal(channel.avatar_url,'https://yt3.googleusercontent.com/example');
 assert.equal(profileInput.safeParse({name:'Test Person',username:'test.person',bio:'',platform:'Instagram',category:'Creators',social_url:'https://instagram.com/test.person',ownership:true,privacy:true,language:'not-a-language'}).success,false);
});

test('weekly/monthly rankings use their own totals and ties while retaining lifetime amounts',()=>{
 const base={...demoProfiles[0],total_paid:100000};
 const a={...base,id:'a',week_paid:20000,month_paid:50000,week_reached_at:'2026-09-15T12:00:00Z'};
 const b={...base,id:'b',total_paid:200000,week_paid:20000,month_paid:80000,week_reached_at:'2026-09-15T13:00:00Z'};
 const c={...base,id:'c',week_paid:0,month_paid:10000};
 assert.deepEqual(orderProfiles([b,a,c],'week').map(p=>p.id),['a','b']);
 assert.deepEqual(orderProfiles([a,b,c],'month').map(p=>p.id),['b','a','c']);
 assert.equal(orderProfiles([a,b],'week')[0].total_paid,100000);
 assert.equal(boardFilters({period:'week'}).initialPeriod,'week');assert.equal(boardFilters({period:'month'}).initialPeriod,'month');assert.equal(boardFilters({period:'year'}).initialPeriod,'all');
});

import { nameExposureTracker } from '../lib/rankme/name-exposure';
test('name exposure requires a full continuous interval, deduplicates scrollbacks and cancels on hidden tabs',()=>{
 const timers = new Map<number,()=>void>();let next=0,eligible=true;const events:string[]=[];
 const clock={schedule:(fn:()=>void)=>{const id=++next;timers.set(id,fn);return id as unknown as ReturnType<typeof setTimeout>},cancel:(id:ReturnType<typeof setTimeout>)=>{timers.delete(id as unknown as number)}};
 const run=()=>{const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn())};
 const tracker=nameExposureTracker(id=>events.push(id),()=>eligible,clock);
 tracker.observe('p',false);run();assert.deepEqual(events,[]);
 tracker.observe('p',true);assert.deepEqual(events,[]);tracker.observe('p',false);run();assert.deepEqual(events,[]);
 tracker.observe('p',true);tracker.pause();run();assert.deepEqual(events,[]);
 tracker.observe('p',true);eligible=false;run();assert.deepEqual(events,[]);
 eligible=true;tracker.observe('p',true);run();assert.deepEqual(events,['p']);
 tracker.observe('p',false);tracker.observe('p',true);run();assert.deepEqual(events,['p']);
});

test('verified promo profiles get zero-cost placement, period visibility and registration tie order',()=>{
 const base={...demoProfiles[0],demo:false,verified:true,total_paid:0,today_paid:0,week_paid:0,month_paid:0};
 const first={...base,id:'promo-first',promo_granted_at:'2026-09-01T12:00:00Z'};
 const second={...base,id:'promo-second',promo_granted_at:'2026-09-01T13:00:00Z'};
 const paid={...base,id:'paid',total_paid:10000,today_paid:10000,week_paid:10000,month_paid:10000};
 for(const period of ['all','today','week','month']) assert.deepEqual(orderProfiles([second,{...first,id:'unverified',verified:false},base,first,paid],period).map(p=>p.id),['paid','promo-first','promo-second']);
 assert.equal(orderProfiles([{...first,status:'hidden'}]).length,0);
});

import {validReaction,changeDemoReaction} from '../lib/rankme/reactions';
test('custom reactions accept exactly one complete emoji, never free text or markup',()=>{
 for(const emoji of ['❤️','👍','👎','😠','🤩','👩🏽‍💻','🇨🇿','1️⃣','👨‍👩‍👧‍👦'])assert(validReaction(emoji),emoji);
 for(const invalid of ['', 'hello', '<script>', '😀😀','x😀','😀 ', '🇨', '🏽', 'á', '🙂'.repeat(40)])assert.equal(validReaction(invalid),false,invalid);
 assert.deepEqual(changeDemoReaction([{emoji:'👍',count:2,mine:true}], '❤️'),[{emoji:'👍',count:1,mine:false},{emoji:'❤️',count:1,mine:true}]);
});

import {verifiedProviderProfile} from '../lib/rankme/provider-profile';
test('provider proof binds the exact remote account and never guesses a Facebook URL',()=>{
 const identities=[{provider:'facebook',provider_id:'123'}];
 const p={id:'123',name:'Public Name',link:'https://www.facebook.com/app_scoped_user_id/123/'};
 assert.equal(verifiedProviderProfile('facebook',identities,p).social_url,'https://facebook.com/app_scoped_user_id/123');
 assert.equal(verifiedProviderProfile('facebook',identities,{...p,link:'https://www.facebook.com/app_scoped_user_id/YXNpZADpOpaqueProfileLink/'}).social_url,'https://facebook.com/app_scoped_user_id/YXNpZADpOpaqueProfileLink');
 assert.equal(verifiedProviderProfile('facebook',identities,{...p,link:'https://www.facebook.com/people/Public-Name/10000123/'}).social_url,'https://facebook.com/people/Public-Name/10000123');
 assert.throws(()=>verifiedProviderProfile('facebook',identities,{...p,link:'https://facebook.com/app_scoped_user_id/a/evil'}));
 assert.throws(()=>verifiedProviderProfile('facebook',identities,{...p,id:'999'}));
 assert.throws(()=>verifiedProviderProfile('facebook',identities,{...p,link:undefined}));
 assert.throws(()=>verifiedProviderProfile('facebook',identities,{...p,link:'https://attacker.example/123'}));
 assert.throws(()=>verifiedProviderProfile('facebook',[],p));
 assert.throws(()=>verifiedProviderProfile('facebook',[{provider:'google',provider_id:'123'}],p));
 assert.equal(verifiedProviderProfile('twitch',[{provider:'twitch',provider_id:'77'}],{data:[{id:'77',login:'real_creator',display_name:'Creator'}]}).social_url,'https://twitch.tv/real_creator');
 assert.equal(verifiedProviderProfile('x',[{provider:'x',provider_id:'88'}],{data:{id:'88',username:'creator',name:'Creator'}}).social_url,'https://x.com/creator');
});

import {hasPaidPlacement,promoSummary,paidSummary} from '../lib/rankme/config';
test('promo credit is disclosed separately from money and ties use first registration',()=>{
 const base={...demoProfiles[0],demo:false,verified:true,total_paid:0,rank_score:4351610,promo_credit_score:4351610,promo_credit_minor:500,promo_credit_currency:'USD',paid_totals:{},promo_granted_at:'2026-09-22T10:00:00Z'};
 const early={...base,id:'early',promo_priority_at:'2026-01-01T00:00:00Z',created_at:'2026-09-22T11:00:00Z'};
 const later={...base,id:'later',promo_priority_at:'2026-02-01T00:00:00Z',created_at:'2026-09-22T10:00:00Z'};
 assert.deepEqual(orderProfiles([later,early]).map(p=>p.id),['early','later']);
 assert.equal(hasPaidPlacement(base),false);assert.equal(paidSummary(base),'0 Kč');assert.match(promoSummary(base),/5.*USD/);
 assert.equal(orderProfiles([early,{...later,rank_score:8703220,paid_totals:{USD:500}}])[0].id,'later');
});

import {publicProfile} from '../lib/rankme/public-profile';
test('equal placement scores use first login even after later payments and public projection',()=>{
 const base={...demoProfiles[0],demo:false,verified:true,rank_score:8703220,total_paid:0,paid_totals:{USD:500}};
 const early={...base,id:'first',registration_at:'2026-01-01T00:00:00Z',reached_amount_at:'2026-09-22T15:00:00Z'};
 const later={...base,id:'second',registration_at:'2026-02-01T00:00:00Z',reached_amount_at:'2026-09-21T12:00:00Z'};
 assert.deepEqual(orderProfiles([later,early]).map(p=>p.id),['first','second']);
 assert.deepEqual(orderProfiles([later,early].map(publicProfile)).map(p=>p.id),['first','second']);
 assert.equal(orderProfiles([early,{...later,rank_score:10000000}])[0].id,'second');
});
import {placementSummary,combinedPlacementSummary,periods} from '../lib/rankme/config';
test('public placement value combines credit and payments without disclosing the private split',()=>{
 const original={...demoProfiles[0],demo:false,verified:true,user_id:'private-owner',total_paid:0,paid_totals:{USD:700,EUR:200},rank_score:9000000,today_score:4351610,week_score:9000000,month_score:9000000,promo_credit_minor:500,promo_credit_currency:'USD',promo_credit_score:4351610,promo_granted_at:'2026-09-22T10:00:00Z',promo_credit_granted_at:'2026-09-22T10:00:00Z',promo_priority_at:'2026-01-01T00:00:00Z',promo_slot:1};
 const result=publicProfile(original);
 assert.deepEqual(result.placement_totals,{USD:1200,EUR:200});
 assert.match(placementSummary(result),/12.*USD/);
 assert.match(combinedPlacementSummary([result,result]),/24.*USD/);
 for(const key of ['user_id','paid_totals','promo_granted_at','promo_credit_minor','promo_credit_currency','promo_credit_score','promo_credit_granted_at','promo_priority_at','promo_slot'])assert.equal(key in result,false,key);
 assert.deepEqual(original.paid_totals,{USD:700,EUR:200});assert.equal(original.promo_credit_minor,500);
 const free={...original,id:'free',paid_totals:{},rank_score:4351610,today_score:0,week_score:0,month_score:0};
 assert.match(placementSummary(publicProfile(free)),/5.*USD/);
 const paid={...original,id:'paid',paid_totals:{USD:900},rank_score:10000000};
 const sources=[original,free,paid];
 for(const period of periods)assert.deepEqual(orderProfiles(sources.map(publicProfile),period).map(p=>p.id),orderProfiles(sources,period).map(p=>p.id));
 const legacy={...demoProfiles[1],demo:false,verified:true};
 for(const period of periods)assert.deepEqual(orderProfiles([legacy].map(publicProfile),period).map(p=>p.id),orderProfiles([legacy],period).map(p=>p.id));
});
