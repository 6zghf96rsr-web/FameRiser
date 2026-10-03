import {getBoardPage} from './data';
import {boardRequest} from './board-page';
import {paymentMinimum} from './payment-minimum';
import {connectProviderProfile} from './provider-profile-server';
import { startFacebookPages, listFacebookPages, connectFacebookPage, checkFacebookPageGrants, FacebookPagesError } from './facebook-pages-server';
import { facebookPageId, facebookPageCursor, facebookPageConsent } from './facebook-pages';
import {createDodoCheckout,dodoWebhook,requestDodoRefund} from "./dodo";
import {serviceAPI,ServiceError,workerAuthorized} from "./service-api";
import {dispatchMail} from "./mail";
import {ACCOUNT_ACCEPTANCE_VERSIONS,POLICY_VERSION} from "./policies";
import {accountDisplayName} from "./account-name";
import { NoticeError, noticeAdmin, receiveNotice } from "./notices-server";
import { validReaction } from "./reactions";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import Stripe from "stripe";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { accountURL, connectionInput } from "./connections";
import { authStatus } from "./auth-status";
import { startYouTube } from "./social-oauth";
import {
  adminDB,
  configured,
  demoEnabled,
  getUser,
  sessionDB,
  publicConfig,
} from "@/lib/supabase/server";
import { getBoard } from "./data";
import {
  checkoutInput,
  profileInput,
  reportInput,
  safeSocialURL,
} from "./validation";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const json = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new HttpError(503, "Platby zatím nejsou aktivované.");
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
}
function enabled() {
  if (demoEnabled())
    throw new HttpError(
      503,
      "Toto je ukázka. Změny účtu ani skutečné platby v demu nejsou dostupné.",
    );
  if (!configured())
    throw new HttpError(503, "Služba zatím není připojená k databázi.");
}
function origin(req: Request) {
  const expected = process.env.APP_URL;
  if (!expected) throw new HttpError(503, "Chybí adresa aplikace.");
  if (req.headers.get("origin") !== new URL(expected).origin)
    throw new HttpError(403, "Požadavek musí pocházet z této aplikace.");
}
function visitor(req: Request) {
  if (!process.env.ANALYTICS_SECRET)
    throw new HttpError(503, "Měření zatím není aktivované.");
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-vercel-forwarded-for") ||
    "local";
  return createHmac("sha256", process.env.ANALYTICS_SECRET)
    .update(
      `${new Date().toISOString().slice(0, 10)}|${ip}|${req.headers.get("user-agent") || ""}`,
    )
    .digest("hex");
}
async function rate(key: string, limit = 20, window = 60) {
  const { data, error } = await adminDB().rpc("consume_rate", {
    p_key: key,
    p_limit: limit,
    p_window: window,
  });
  if (error)
    throw new HttpError(503, "Ochrana požadavků je dočasně nedostupná.");
  if (!data)
    throw new HttpError(429, "Příliš mnoho požadavků. Zkus to prosím později.");
}
async function user() {
  const u = await getUser();
  if (!u) throw new HttpError(401, "Nejdříve se přihlas.");
  const { data, error } = await adminDB()
    .from("users")
    .select("role,banned")
    .eq("id", u.id)
    .single();
  if (error || !data || data.banned)
    throw new HttpError(403, "Účet není aktivní.");
  if (!u.email_confirmed_at) throw new HttpError(403, "Nejdříve potvrď kontaktní e-mail.");
  const acceptance=await adminDB().from('account_acceptances').select('version').eq('user_id',u.id).in('version',ACCOUNT_ACCEPTANCE_VERSIONS).maybeSingle();
  if(acceptance.error)throw new HttpError(503,'Podmínky účtu nelze ověřit.');
  if(!acceptance.data)throw new HttpError(403,'Nejdříve potvrď věk 18+ a podmínky na /account-consent.');
  return { ...u, role: data.role };
}
async function admin() {
  const u = await user();
  if (u.role !== "admin")
    throw new HttpError(403, "Tato část je dostupná pouze administrátorovi.");
  return u;
}
async function security() {
  const { data, error } = await adminDB()
    .from("app_settings")
    .select("value")
    .eq("key", "security")
    .single();
  if (error) throw new HttpError(503, "Pravidla odkazů se nepodařilo načíst.");
  return data.value;
}
function checked<T extends { error: any; data: any }>(r: T) {
  if (r.error) {
    console.error("Database operation failed", r.error.code);
    throw new HttpError(
      400,
      r.error.code === "23505"
        ? "Tento profil nebo požadavek už existuje."
        : "Požadavek se nepodařilo uložit.",
    );
  }
  return r.data;
}
async function body(req: Request) {
  const text = await req.text();
  if (text.length > 15000)
    throw new HttpError(413, "Požadavek je příliš velký.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Neplatný požadavek.");
  }
}
function isBot(req: Request) {
  return /bot|crawler|spider|headless|preview|facebookexternalhit/i.test(
    req.headers.get("user-agent") || "",
  );
}
async function webhook(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !configured() || demoEnabled())
    throw new HttpError(503, "Webhook není nakonfigurovaný.");
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      await req.text(),
      req.headers.get("stripe-signature") || "",
      secret,
    );
  } catch {
    throw new HttpError(400, "Neplatný podpis webhooku.");
  }
  const db = adminDB();
  if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") return json({ received: true });
    const actual = await stripe().checkout.sessions.retrieve(session.id);
    if (
      actual.payment_status !== "paid" ||
      actual.mode !== "payment" ||
      !actual.metadata?.payment_id ||
      actual.amount_total === null
    )
      throw new HttpError(400, "Neplatná potvrzená platba.");
    const { error } = await db.rpc("apply_stripe_payment", {
      p_event: event.id,
      p_type: event.type,
      p_payment: actual.metadata.payment_id,
      p_checkout: actual.id,
      p_intent:
        typeof actual.payment_intent === "string"
          ? actual.payment_intent
          : actual.payment_intent?.id,
      p_amount: actual.amount_total,
      p_currency: actual.currency,
    });
    if (error) {
      console.error("Webhook transaction failed", error.code);
      throw new HttpError(500, "Platbu se nepodařilo zaúčtovat.");
    }
  } else if (
    [
      "checkout.session.expired",
      "checkout.session.async_payment_failed",
    ].includes(event.type)
  ) {
    const s = event.data.object as Stripe.Checkout.Session;
    const r = await db
      .from("payments")
      .update({ status: event.type.endsWith("expired") ? "expired" : "failed" })
      .eq("stripe_checkout_id", s.id)
      .eq("status", "pending");
    if (r.error) throw new HttpError(500, "Platbu se nepodařilo aktualizovat.");
  } else if (event.type === "charge.refunded") {
    const c = event.data.object as Stripe.Charge;
    const { error } = await db.rpc("apply_refund", {
      p_event: event.id,
      p_intent:
        typeof c.payment_intent === "string"
          ? c.payment_intent
          : c.payment_intent?.id,
      p_refunded: c.amount_refunded,
    });
    if (error) throw new HttpError(500, "Refundaci se nepodařilo zaúčtovat.");
  }
  return json({ received: true });
}
export async function handle(req: Request, path: string[]) {
  try {
    const route = path.join("/");
    const method = req.method;
    if(route==='dodo/webhook'&&method==='POST'){enabled();return json(await dodoWebhook(req,adminDB()));}
    if(route==='internal/page-checks'&&method==='POST'){
      enabled();const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.get('authorization')||'')?.[1];
      if(!token)throw new HttpError(401,'Neplatné oprávnění.');
      const authorization=await adminDB().rpc('consume_page_worker_ticket',{p_token:token});
      if(authorization.error)throw new HttpError(503,'Kontrolu nelze zahájit.');
      if(!authorization.data)throw new HttpError(401,'Neplatné nebo použité oprávnění.');
      return json(await checkFacebookPageGrants());
    }
    if(route==='internal/mail'&&method==='POST'){enabled();if(!workerAuthorized(req))throw new HttpError(401,'Neplatné oprávnění.');return json(await dispatchMail(adminDB()));}
    if (route === "stripe/webhook" && method === "POST")
      return await webhook(req);
    if (route === "leaderboard" && method === "GET") {
      const query=Object.fromEntries(new URL(req.url).searchParams);
      const b = await getBoardPage(boardRequest(query,query.platform));
      return json(b, b.error ? 503 : 200);
    }
    if (route === "config" && method === "GET")
      return json({
        demo: demoEnabled(),
        configured: configured(),
        payments: process.env.PAYMENTS_ENABLED === "true",
        auth: await authStatus(),
        ...publicConfig(),
      });
    if (path[0] === "profiles" && path.length === 3 && path[2] === "ratings")
      throw new HttpError(410, "Samostatné hodnocení bylo nahrazeno komentáři s volitelnými hvězdičkami.");
    if (path[0] === "profiles" && path.length === 3 && path[2] === "reviews" && method === "GET") {
      if (demoEnabled()) return json({items:[],count:0,rated_count:0,average:null,mine:null,can_write:false,is_owner:false,signed_in:false,page:1,demo:true});
      enabled();
      const id = z.string().uuid().parse(path[1]);
      const page = z.coerce.number().int().min(1).max(100000).parse(new URL(req.url).searchParams.get('page') || 1);
      const u = await getUser();
      const result = await adminDB().rpc('get_profile_reviews',{p_profile:id,p_user:u?.id || null,p_page:page});
      if (result.error) throw new HttpError(404,"Komentáře nejsou dostupné nebo profil není veřejný.");
      return json(result.data);
    }
    if (path[0] === 'reviews' && path[2] === 'discussion' && path.length === 3 && method === 'GET') {
      enabled();
      const id=z.string().uuid().parse(path[1]);
      const page=z.coerce.number().int().min(1).max(100000).parse(new URL(req.url).searchParams.get('page')||1);
      const u=await getUser();
      const r=await adminDB().rpc('get_review_discussion',{p_review:id,p_user:u?.id||null,p_page:page});
      if(r.error)throw new HttpError(404,'Diskuse není dostupná nebo komentář není veřejný.');
      return json(r.data);
    }
    if (route === "auth" && method === "POST") {
      origin(req);
      enabled();
      const v = await body(req);
      if (!["login", "register", "logout", "reset"].includes(v.action))
        throw new HttpError(400, "Neplatná akce.");
      const db = (await sessionDB())!;
      if (v.action === "logout") {
        await db.auth.signOut();
        return json({ ok: true });
      }
      await rate("auth:" + visitor(req), 10, 300);
      if (
        typeof v.email !== "string" ||
        v.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)
      )
        throw new HttpError(400, "Zadej platný e-mail.");
      if (v.action === "reset") {
        await db.auth.resetPasswordForEmail(v.email, {
          redirectTo: process.env.APP_URL + "/login?reset=1",
        });
        return json({
          message:
            "Pokud tento účet existuje, odeslali jsme e-mail pro obnovu hesla.",
        });
      }
      if (
        typeof v.password !== "string" ||
        v.password.length < 8 ||
        v.password.length > 200
      )
        throw new HttpError(400, "Heslo musí mít alespoň 8 znaků.");
      if (v.action === "register") {
        if (v.terms !== true || v.adult !== true)
          throw new HttpError(
            400,
            "Pro registraci potvrď věk alespoň 18 let a podmínky.",
          );
        const { error } = await db.auth.signUp({
          email: v.email,
          password: v.password,
          options: { emailRedirectTo: process.env.APP_URL + "/auth/confirm" },
        });
        if (error)
          throw new HttpError(
            400,
            "Registraci se nepodařilo dokončit. Zkontroluj údaje nebo se přihlas.",
          );
        return json({ message: "Zkontroluj e-mail a potvrď svou registraci." });
      }
      const { error } = await db.auth.signInWithPassword({
        email: v.email,
        password: v.password,
      });
      if (error) throw new HttpError(401, "E-mail nebo heslo není správné.");
      const {data:{user:logged}}=await db.auth.getUser();
      const accepted=logged?await adminDB().from('account_acceptances').select('version').eq('user_id',logged.id).in('version',ACCOUNT_ACCEPTANCE_VERSIONS).maybeSingle():null;
      return json({ok:true,acceptance_required:!accepted?.data});
    }
    enabled();
    const db = adminDB();
    if (method !== "GET") origin(req);
    if((['service-requests','account/acceptance'].includes(route)&&['GET','POST'].includes(method))||(route==='admin/service'&&['GET','POST'].includes(method))){
      if(method==='POST')await rate('service:'+visitor(req),10,3600);
      if(route==='admin/service')await admin();
      const response=await serviceAPI(req,route,db,route==='admin/service');
      if(method==='POST')await dispatchMail(db).catch(()=>{});
      return json(response);
    }
    if (route === "notices" && method === "POST") {
      await rate("notice:" + visitor(req), 5, 3600);
      return json(await receiveNotice(req, visitor(req), db), 201);
    }
    if (path[0] === "admin" && path[1] === "notices") {
      const u = await admin();
      await rate("notice-admin:" + u.id, 120, 60);
      const result = await noticeAdmin(req, u.id, path, db);
      if(method==='POST')await dispatchMail(db).catch(()=>{});
      return result instanceof Response ? result : json(result);
    }
    if (route === "me/insights" && method === "GET") {
      const u = await user();
      const days = z.coerce.number().refine(n => [0,1,7,30].includes(n)).parse(new URL(req.url).searchParams.get('days') ?? '30');
      return json(checked(await db.rpc('creator_insights',{p_user:u.id,p_days:days})));
    }
    if (path[0] === "profiles" && path.length === 3 && path[2] === "reviews" && ["POST","DELETE"].includes(method)) {
      const u = await user();
      await rate('reviews:'+u.id,10,3600);
      const id = z.string().uuid().parse(path[1]);
      const v = method === 'DELETE' ? {author_name:null,body:null,score:null} : z.object({author_name:z.string().trim().min(2).max(60),body:z.string().trim().min(10).max(2000),score:z.number().int().min(1).max(5).nullable()}).strict().parse(await body(req));
      const result = await db.rpc('save_profile_review',{p_user:u.id,p_profile:id,p_author:v.author_name,p_body:v.body,p_score:v.score});
      if (result.error) throw new HttpError(400,'Komentář nelze uložit. Vlastní nebo neveřejný profil nelze komentovat.');
      return json(result.data);
    }
    if (path[0] === 'reviews' && path.length === 3 && path[2] === 'replies' && ['POST','DELETE'].includes(method)) {
      const u=await user();await rate('replies:'+u.id,20,3600);
      const review=z.string().uuid().parse(path[1]);
      const v=method==='DELETE'?z.object({reply_id:z.string().uuid()}).strict().parse(await body(req)):z.object({body:z.string().trim().min(2).max(2000),reply_id:z.string().uuid().optional()}).strict().parse(await body(req));
      const r=await db.rpc('save_review_reply',{p_user:u.id,p_review:review,p_body:'body' in v?v.body:null,p_reply:v.reply_id||null});
      if(r.error)throw new HttpError(400,'Odpověď nelze uložit. Diskutovat mohou majitel profilu a autor veřejného komentáře; upravovat a mazat lze jen vlastní odpovědi.');
      return json(r.data);
    }
    if (path[0] === 'reviews' && path.length === 3 && path[2] === 'reaction' && method === 'POST') {
      const u=await user();await rate('reactions:'+u.id,60,300);
      const v=z.object({emoji:z.string().refine(validReaction,'Vlož jeden smajlík nebo emoji.').nullable(),reply_id:z.string().uuid().optional()}).strict().parse(await body(req));
      const r=await db.rpc('set_review_reaction',{p_user:u.id,p_review:z.string().uuid().parse(path[1]),p_reply:v.reply_id||null,p_emoji:v.emoji});
      if(r.error)throw new HttpError(400,'Reagovat můžeš jen na zveřejněný příspěvek jiného uživatele.');
      return json({reactions:r.data});
    }
    if (path[0] === 'replies' && path[2] === 'report' && path.length === 3 && method === 'POST') {
      const u=await user();await rate('review-report:'+u.id,5,3600);
      const reply=checked(await db.from('review_replies').select('id,review_id').eq('id',z.string().uuid().parse(path[1])).eq('status','published').single());
      const parent=checked(await db.from('profile_reviews').select('id,profile_id').eq('id',reply.review_id).eq('status','published').single());
      if(!checked(await db.rpc('is_public_profile',{p_profile:parent.profile_id})))throw new HttpError(404,'Odpověď není veřejná.');
      checked(await db.from('reports').insert({profile_id:parent.profile_id,review_id:parent.id,reply_id:reply.id,reporter_hash:visitor(req),reason:'other',details:'Nahlášená odpověď: '+reply.id}));
      return json({ok:true});
    }
    if (route === 'admin/replies' && method === 'GET') {
      await admin();
      const page=z.coerce.number().int().min(1).max(100000).parse(new URL(req.url).searchParams.get('page')||1);
      const status=z.enum(['pending','published','hidden']).parse(new URL(req.url).searchParams.get('status')||'pending');
      const r=await db.from('review_replies').select('id,review_id,author_name,body,status,created_at,profile_reviews(profile_id,author_name,body)',{count:'exact'}).eq('status',status).order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1);
      return json({items:checked(r),count:r.count,page});
    }
    if (route === 'admin/replies' && method === 'POST') {
      const u=await admin();
      const v=z.object({id:z.string().uuid(),status:z.enum(['published','hidden'])}).strict().parse(await body(req));
      checked(await db.rpc('moderate_review_reply',{p_admin:u.id,p_reply:v.id,p_status:v.status}));
      return json({ok:true});
    }
    if (path[0] === 'reviews' && path[2] === 'report' && path.length === 3 && method === 'POST') {
      const u = await user();
      await rate('review-report:'+u.id,5,3600);
      const review = checked(await db.from('profile_reviews').select('id,profile_id').eq('id',z.string().uuid().parse(path[1])).eq('status','published').single());
      if (!checked(await db.rpc('is_public_profile',{p_profile:review.profile_id}))) throw new HttpError(404,'Komentář není veřejný.');
      checked(await db.from('reports').insert({profile_id:review.profile_id,review_id:review.id,reporter_hash:visitor(req),reason:'other',details:'Nahlášený komentář: '+review.id}));
      return json({ok:true});
    }
    if (route === 'admin/reviews' && method === 'GET') {
      await admin();
      const page = z.coerce.number().int().min(1).max(100000).parse(new URL(req.url).searchParams.get('page') || 1);
      const status = z.enum(['pending','published','hidden']).parse(new URL(req.url).searchParams.get('status') || 'pending');
      const r = await db.from('profile_reviews').select('id,profile_id,author_name,body,score,status,created_at',{count:'exact'}).eq('status',status).order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1);
      return json({items:checked(r),count:r.count,page});
    }
    if (route === 'admin/reviews' && method === 'POST') {
      const u = await admin();
      const v = z.object({id:z.string().uuid(),status:z.enum(['published','hidden'])}).strict().parse(await body(req));
      checked(await db.rpc('moderate_profile_review',{p_admin:u.id,p_review:v.id,p_status:v.status}));
      return json({ok:true});
    }
    if (route === "connections" && method === "GET") {
      const u = await user();
      const [connections, owned, publicBoard, promoCount, ownerPromo] = await Promise.all([
        db
          .from("social_connections")
          .select(
            "id,platform,social_url,label,status,method,verified_at,created_at,social_bio,avatar_url,suggested_language,suggested_country,account_kind,facebook_page_grants(valid_until,token_expires_at,last_error)",
          )
          .eq("user_id", u.id)
          .order("created_at", { ascending: false }),
        db
          .from("profiles")
          .select("id,slug,social_url,social_platforms(name),total_paid,promo_granted_at,status")
          .eq("user_id", u.id)
          .neq("status", "deleted"),
        db.rpc("get_commerce_board"),
        db.from("promo_admissions").select("id",{count:"exact",head:true}),
        db.from("promo_admissions").select("id",{count:"exact",head:true}).eq("user_id",u.id),
      ]);
      checked(promoCount);checked(ownerPromo);
      const ownedProfiles = checked(owned);
      const publicIds = new Set(checked(publicBoard).filter((p: { verified: boolean }) => p.verified === true).map((p: { id: string }) => p.id));
      return json({
        promo_remaining: Math.max(0,1000-(promoCount.count||0)),
        promo_eligible: (ownerPromo.count||0)===0,
        connections: checked(connections).map((c: any) => {
          const p = ownedProfiles.find(
            (p: any) =>
              p.social_url === c.social_url &&
              p.social_platforms.name === c.platform,
          );
          const {facebook_page_grants:grant,...connection}=c;
          const pageExpired=c.account_kind==='facebook_page'&&(!grant||Date.parse(grant.valid_until)<=Date.now()||Date.parse(grant.token_expires_at)<=Date.now());
          return {
            ...connection,
            status:pageExpired?'unverified':c.status,
            verification_notice:pageExpired?'Oprávnění ke stránce je potřeba znovu ověřit. Do té doby se stránka nezobrazuje veřejně.':null,
            listing: p
              ? {
                  id: p.id,
                  slug: p.slug,
                  total_paid: p.total_paid,
                  promo_granted_at: p.promo_granted_at,
                  status: p.status,
                  public: publicIds.has(p.id),
                }
              : undefined,
          };
        }),
        identities: (u.identities || []).map((i) => ({
          id: i.id,
          provider: i.provider,
        })),
        email: u.email,
      });
    }
    if (route === 'connections/facebook-pages/start' && method === 'POST') {
      const u=await user();await rate('facebook-pages-start:'+u.id,10,3600);
      return json({url:await startFacebookPages(u.id)});
    }
    if (route === 'connections/facebook-pages' && method === 'GET') {
      const u=await user();await rate('facebook-pages-list:'+u.id,60,3600);
      const after=facebookPageCursor.optional().parse(new URL(req.url).searchParams.get('after') || undefined);
      return json(await listFacebookPages(u.id,after));
    }
    if (route === 'connections/facebook-pages' && method === 'POST') {
      const u=await user();await rate('facebook-pages-connect:'+u.id,15,3600);
      const v=z.object({page_id:facebookPageId,consent:facebookPageConsent}).strict().parse(await body(req));
      return json(await connectFacebookPage(u.id,v.page_id,v.consent));
    }
    if (route === "connections/oauth" && method === "POST") {
      const u = await user();
      await rate("provider-profile:"+u.id,10,3600);
      const v=z.object({provider:z.enum(['facebook','twitch','x']),reauthorize:z.boolean().optional()}).strict().parse(await body(req));
      const session=(await sessionDB())!;
      if(v.reauthorize) {
        const authorize=u.identities?.some(i=>i.provider===v.provider) ? session.auth.signInWithOAuth.bind(session.auth) : session.auth.linkIdentity.bind(session.auth);
        const {data,error}=await authorize({provider:v.provider,options:{redirectTo:process.env.APP_URL+'/auth/callback?next=/connections&profile_provider='+v.provider,scopes:v.provider==='facebook'?'email,public_profile,user_link':undefined}});
        if(error||!data.url) throw new HttpError(400,'Propojení nelze zahájit. Zkontroluj oprávnění aplikace u sociální sítě.');
        return json({url:data.url});
      }
      const {data:{session:current}}=await session.auth.getSession();
      if(!current?.provider_token) throw new HttpError(409,'Pro ověření se znovu přihlas přes vybranou síť.');
      try {return json({id:await connectProviderProfile(u,v.provider,current.provider_token)});} catch(e) {throw new HttpError(409,(e as Error).message);}
    }
    if (route === "connections" && method === "POST") {
      const u = await user();
      await rate("connections:" + u.id, 15, 3600);
      const v = connectionInput.parse(await body(req));
      const sec = await security();
      const url = accountURL(
        v.social_url,
        v.platform,
        sec.blacklist,
        sec.allowed_domains,
      );
      const network = await db
        .from("social_platforms")
        .select("id")
        .eq("name", v.platform)
        .eq("active", true)
        .maybeSingle();
      if (!network.data) throw new HttpError(400, "Tato síť není dostupná.");
      const address = new URL(url);
      const label = decodeURIComponent(
        address.pathname.split("/").pop() || address.hostname,
      );
      const connection = checked(
        await db
          .from("social_connections")
          .insert({
            user_id: u.id,
            platform: v.platform,
            social_url: url,
            label,
          })
          .select("id")
          .single(),
      );
      return json(connection, 201);
    }
    if (route === "connections/youtube" && method === "POST") {
      const u = await user();
      await rate("youtube:" + u.id, 10, 3600);
      return json({ url: await startYouTube(u.id) });
    }
    if (path[0] === "connections" && path.length === 3 && method === "POST") {
      const u = await user();
      const id = z.string().uuid().parse(path[1]);
      const action = z
        .enum(["challenge", "submit", "disconnect"])
        .parse(path[2]);
      if (action !== "disconnect")
        throw new HttpError(410, "Ověření přes bio bylo ukončeno. Ověření zprávou od FameRiser zatím čeká na spuštění.");
      await rate("connection-action:" + u.id, 20, 3600);
      const r = await db.rpc("connection_action", {
        p_user: u.id,
        p_action: action,
        p_id: id,
      });
      if (r.error)
        throw new HttpError(
          400,
          "Akci nelze dokončit. Ověř platnost kódu a obnov stránku.",
        );
      return json(r.data);
    }
    if (route === "auth/link" && method === "POST") {
      await user();
      const v = z
        .object({ provider: z.enum(["facebook", "google", "apple", "twitch", "x"]) })
        .strict()
        .parse(await body(req));
      const status = await authStatus();
      if (!status[v.provider])
        throw new HttpError(503, "Tento způsob přihlášení zatím není aktivní.");
      const session = (await sessionDB())!;
      const { data, error } = await session.auth.linkIdentity({
        provider: v.provider,
        options: {
          redirectTo: process.env.APP_URL + "/auth/callback?next=" + encodeURIComponent('/dashboard?tab=settings') + "&profile_provider=" + v.provider,
          scopes: v.provider === "facebook" ? "email,public_profile,user_link" : undefined,
        },
      });
      if (error || !data.url)
        throw new HttpError(
          400,
          "Účet nelze propojit. Zkontroluj, že není připojený k jinému účtu FameRiser a že je povolené propojování identit.",
        );
      return json({ url: data.url });
    }
    if (route === "me" && method === "GET") {
      const u = await user();
      const [p, pay, dodo, promoCredits] = await Promise.all([
        db
          .from("profiles")
          .select("*,social_platforms(name),categories(name)")
          .eq("user_id", u.id)
          .neq("status", "deleted")
          .order("created_at", { ascending: false }),
        db
          .from("payments")
          .select(
            "id,profile_id,status",
          )
          .eq("user_id", u.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(100),
        db.from('dodo_orders').select('profile_id,amount,refunded_amount,currency,active_score,status').eq('user_id',u.id).in('status',['paid','refunded']),
        db.rpc('get_owned_promo_credits',{p_user:u.id}),
      ]);
      return json({
        user: { display_name: accountDisplayName(u), id: u.id, role: u.role },
        profiles: checked(p).map((profile:any)=>{const orders=checked(dodo).filter((o:any)=>o.profile_id===profile.id);const totals:Record<string,number>={};for(const o of orders)totals[o.currency]=(totals[o.currency]||0)+o.amount-o.refunded_amount;const credit=checked(promoCredits).find((c:any)=>c.id===profile.id)||{};return {...profile,...credit,paid_totals:totals,rank_score:profile.total_paid>0?null:orders.reduce((n:number,o:any)=>n+o.active_score,0)+(credit.promo_credit_score||0)};}),
        payments: checked(pay),
      });
    }
    if (route === "profiles" && method === "POST") {
      const u = await user();
      await rate("profiles:" + u.id, 10, 3600);
      const v = profileInput.parse(await body(req));
      if(v.non_political!==true)throw new HttpError(400,'Potvrď, že nejde o politickou ani volební propagaci.');
      const sec = await security();
      const url = accountURL(
        v.social_url,
        v.platform,
        sec.blacklist,
        sec.allowed_domains,
      );
      const proof = await db.from("social_connections").select("id,avatar_url")
        .eq("user_id", u.id).eq("platform", v.platform)
        .eq("social_url", url).eq("status", "verified").maybeSingle();
      if (proof.error) throw new HttpError(503, "Ověření účtu se nepodařilo zkontrolovat.");
      if (!proof.data) throw new HttpError(409, "Nejdříve dokonči ověření a propojení tohoto sociálního účtu.");
      if (
        v.avatar_url &&
        !(v.import_consent===true && v.avatar_url === proof.data?.avatar_url) &&
        !v.avatar_url.startsWith(
          publicConfig().url +
            "/storage/v1/object/public/avatars/" +
            u.id +
            "/",
        )
      )
        throw new HttpError(400, "Nahraj vlastní profilovou fotografii.");
      const [sp, ca] = await Promise.all([
        db
          .from("social_platforms")
          .select("id")
          .eq("name", v.platform)
          .eq("active", true)
          .single(),
        db
          .from("categories")
          .select("id")
          .eq("name", v.category)
          .eq("active", true)
          .single(),
      ]);
      if (!sp.data || !ca.data)
        throw new HttpError(400, "Síť nebo kategorie není dostupná.");
      const slug =
        v.username
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") +
        "-" +
        crypto.randomUUID().slice(0, 8);
      const p = checked(
        await db
          .from("profiles")
          .insert({
            user_id: u.id,
            name: v.name,
            username: v.username,
            bio: v.bio,
            language:v.language, country:v.country, region:v.region,
            publication_consent:{version:POLICY_VERSION,public:true,import:v.import_consent===true,at:new Date().toISOString()},non_political_confirmed_at:new Date().toISOString(),
            slug,
            avatar_url: v.avatar_url || null,
            social_url: url,
            social_platform_id: sp.data.id,
            category_id: ca.data.id,
          })
          .select("id,slug,total_paid")
          .single(),
      );
      // The insert trigger atomically allocates promo, including its global quota.
      const placement=checked(await db.from('profiles').select('promo_granted_at,status').eq('id',p.id).single());
      return json({...p,...placement}, 201);
    }
    if (path.length === 3 && path[0] === "profiles" && path[2] === "promo" && method === "POST") {
      const u = await user();
      await rate("promo:" + u.id, 10, 3600);
      const v = await body(req);
      if (v.accepted !== true) throw new HttpError(400, "Potvrď podmínky promo umístění.");
      const result = await db.rpc("claim_promo_placement", {p_user:u.id,p_profile:z.string().uuid().parse(path[1])});
      if (result.error) {
        const message = result.error.message || "";
        throw new HttpError(409, message.includes("Page payment required") ? "Facebook stránku zařadíš až úspěšnou platbou od 5 USD; promo se na stránky nevztahuje." : message.includes("verification") ? "Nejdříve ověř vlastnictví tohoto profilu." : message.includes("not active") ? "Promo akce zatím není spuštěná." : message.includes("full") ? "Všech 1 000 promo míst napříč sítěmi je již obsazeno. Můžeš zvolit placené umístění." : message.includes("already used") ? "Tvůj účet už promo kredit využil. Další profil nebo stránku můžeš zařadit placeně za 5 USD." : "Tento profil nyní nelze zařadit do promo akce.");
      }
      return json(result.data);
    }
    if (route.startsWith("profiles/") && method === "PATCH") {
      const u = await user();
      await rate("edit:" + u.id);
      const id = path[1];
      const v = profileInput.parse(await body(req));
      if(v.non_political!==true)throw new HttpError(400,'Potvrď, že nejde o politickou ani volební propagaci.');
      const sec = await security();
      const url = accountURL(
        v.social_url,
        v.platform,
        sec.blacklist,
        sec.allowed_domains,
      );
      const previous = checked(await db.from("profiles").select("avatar_url,publication_consent").eq("id",id).eq("user_id",u.id).single());
      const proof = await db.from("social_connections").select("id,avatar_url")
        .eq("user_id",u.id).eq("platform",v.platform).eq("social_url",url).eq("status","verified").maybeSingle();
      if (proof.error) throw new HttpError(503, "Propojení účtu se nepodařilo zkontrolovat.");
      if (
        v.avatar_url && v.avatar_url !== previous.avatar_url &&
        !(v.import_consent===true && v.avatar_url === proof.data?.avatar_url) &&
        !v.avatar_url.startsWith(
          publicConfig().url +
            "/storage/v1/object/public/avatars/" +
            u.id +
            "/",
        )
      )
        throw new HttpError(400, "Neplatný avatar.");
      const sp = await db
        .from("social_platforms")
        .select("id")
        .eq("name", v.platform)
        .eq("active", true)
        .single();
      const cat = await db
        .from("categories")
        .select("id")
        .eq("name", v.category)
        .eq("active", true)
        .single();
      if (!sp.data || !cat.data)
        throw new HttpError(400, "Síť nebo kategorie není aktivní.");
      const p = checked(
        await db
          .from("profiles")
          .select("id,social_url")
          .eq("id", id)
          .eq("user_id", u.id)
          .neq("status", "deleted")
          .single(),
      );
      const data = checked(
        await db
          .from("profiles")
          .update({
            name: v.name,
            username: v.username,
            bio: v.bio,
            language:v.language, country:v.country, region:v.region,
            publication_consent:{version:POLICY_VERSION,public:true,import:v.import_consent===true || (v.avatar_url===previous.avatar_url && previous.publication_consent?.import===true),at:new Date().toISOString()},non_political_confirmed_at:new Date().toISOString(),
            social_url: url,
            social_platform_id: sp.data.id,
            category_id: cat.data.id,
            avatar_url: v.avatar_url || null,
            ...(p.social_url !== url ? { verified: false } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", u.id)
          .select("id")
          .single(),
      );
      await db
        .from("activity")
        .insert({ profile_id: id, kind: "profile_updated", payload: {} });
      return json(data);
    }
    if (route === "upload" && method === "POST") {
      const u = await user();
      await rate("upload:" + u.id, 10, 3600);
      if (Number(req.headers.get("content-length") || 0) > 2200000)
        throw new HttpError(413, "Fotografie může mít maximálně 2 MB.");
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > 2097152 || file.size < 12)
        throw new HttpError(400, "Nahraj JPG, PNG nebo WebP do 2 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime =
        bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
          ? "image/jpeg"
          : bytes
                .slice(0, 8)
                .every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i])
            ? "image/png"
            : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
                String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
              ? "image/webp"
              : null;
      if (!mime)
        throw new HttpError(400, "Soubor není podporovaná fotografie.");
      const key = `${u.id}/${crypto.randomUUID()}.${mime.split("/")[1]}`;
      checked(
        await db.storage
          .from("avatars")
          .upload(key, bytes, { contentType: mime, upsert: false }),
      );
      return json({
        url: db.storage.from("avatars").getPublicUrl(key).data.publicUrl,
      });
    }
    if(path[0]==='commerce'&&path[1]==='orders'&&path[3]==='contract'&&method==='GET'){
      const u=await getUser();if(!u)throw new HttpError(401,'Nejdříve se přihlas.');
      const order=checked(await db.from('dodo_orders').select('id,documents,documents_hash,consents,created_at,amount,currency,billing_country,rank_score,fx_rate,fx_date').eq('id',z.string().uuid().parse(path[2])).eq('user_id',u.id).single());
      return new NextResponse(order.documents.html || JSON.stringify(order,null,2),{headers:{'Content-Type':order.documents.html?'text/html; charset=utf-8':'application/json','Content-Disposition':`attachment; filename="fameriser-contract-${order.id}.${order.documents.html?"html":"json"}"`,'Content-Security-Policy':"sandbox",'Cache-Control':'private, no-store'}});
    }
    if(route==='commerce/minimum'&&method==='GET'){const u=await user();await rate('minimum:'+u.id,60,3600);const currency=z.enum(['CZK','EUR','USD','PLN','JPY']).parse(new URL(req.url).searchParams.get('currency'));return json(await paymentMinimum(currency));}
    if(route==='commerce/orders'&&method==='GET'){const u=await getUser();if(!u)throw new HttpError(401,'Nejdříve se přihlas.');return json({items:checked(await db.from('dodo_orders').select('id,status,amount,currency,tax,net,rank_score,active_score,refunded_amount,fx_rate,fx_date,created_at,paid_at').eq('user_id',u.id).order('created_at',{ascending:false}).limit(100))});}
    if(route==='admin/dodo-refund'&&method==='POST'){const u=await admin();const v=z.object({id:z.string().uuid(),confirmed:z.literal(true)}).parse(await body(req));return json(await requestDodoRefund(v.id,u.id,db));}
    if(route==='checkout'&&method==='POST'){const u=await user();await rate('checkout:'+u.id,12,300);return json(await createDodoCheckout(await body(req),u,db));}
    if(route.startsWith('checkout/'))throw new HttpError(410,'Starší platební odkaz již nelze použít. Vytvoř novou platbu v účtu.');
    if (route === "reports" && method === "POST") {
      await rate("report:" + visitor(req), 5, 3600);
      const v = reportInput.parse(await body(req));
      if (
        !checked(await db.rpc("is_public_profile", { p_profile: v.profile_id }))
      )
        throw new HttpError(404, "Profil není veřejný.");
      const p = checked(
        await db
          .from("profiles")
          .select("id")
          .eq("id", v.profile_id)
          .eq("status", "active")
          .single(),
      );
      checked(
        await db
          .from("reports")
          .insert({ ...v, profile_id: p.id, reporter_hash: visitor(req) }),
      );
      return json({ ok: true }, 201);
    }
    if (route === "track" && method === "POST") {
      if (
        isBot(req) || !process.env.ANALYTICS_SECRET ||
        !req.headers.get("cookie")?.includes("rankme_analytics=yes")
      )
        return json({ tracked: false });
      const v = z.object({kind:z.enum(['leaderboard_page_view','impression','name_impression','profile_detail_view']),ids:z.array(z.string().uuid()).min(1).max(50),event_id:z.string().uuid(),source:z.enum(['all','Instagram','Facebook','TikTok','YouTube','Twitch','X','profile'])}).strict().parse(await body(req));
      const hash = visitor(req);
      await rate("track:" + hash, 240, 300);
      const current = await getUser();
      const count = checked(await db.rpc('record_profile_traffic',{p_user:current?.id || null,p_ids:v.ids,p_kind:v.kind,p_event:v.event_id,p_hash:hash,p_source:v.source}));
      return json({tracked:count>0});
    }
    if (route.startsWith("outbound/") && method === "GET") {
      const id = z.string().uuid().parse(path[1]);
      if (!checked(await db.rpc("is_public_profile", { p_profile: id })))
        throw new HttpError(404, "Profil není veřejný.");
      const p = checked(
        await db
          .from("profiles")
          .select("social_url,user_id,social_platforms(name)")
          .eq("id", path[1])
          .eq("status", "active")
          .single(),
      );
      const sec = await security();
      const social = (p.social_platforms as any)?.name;
      const url = safeSocialURL(
        p.social_url,
        social,
        sec.blacklist,
        sec.allowed_domains,
      );
      if (
        !isBot(req) &&
        req.headers.get("cookie")?.includes("rankme_analytics=yes") &&
        process.env.ANALYTICS_SECRET
      ) {
        try {
          const hash = visitor(req);
          await rate("click:" + hash, 40, 300);
          const current = await getUser();
          if (!current || current.id !== p.user_id) {
            await db.from('profile_traffic').insert({profile_id:path[1],visitor_hash:hash,kind:'outbound_click',event_id:crypto.randomUUID(),source:'outbound'});
          }
        } catch {
          /* Analytics failure must not block a valid outbound link. */
        }
      }
      return NextResponse.redirect(url, 302);
    }
    if (route === "account/export" && method === "GET") {
      const u = await getUser();if(!u?.email_confirmed_at)throw new HttpError(401,"Přihlas se účtem s potvrzeným e-mailem, nebo napiš na info@fameriser.com.");
      await rate("export:" + u.id, 3, 3600);
      const [p, pay, reports, connections, challenges, ratings, reviews, promoAdmissions, replies, reactions, dodo, requests, decisions, consents] =
        await Promise.all([
          db.from("profiles").select("*").eq("user_id", u.id),
          db
            .from("payments")
            .select("id,amount,currency,status,created_at,paid_at")
            .eq("user_id", u.id),
          db
            .from("deletion_requests")
            .select("id,status,created_at")
            .eq("user_id", u.id),
          db
            .from("social_connections")
            .select(
              "id,platform,social_url,label,status,method,verified_at,created_at,social_bio,avatar_url,suggested_language,suggested_country,account_kind",
            )
            .eq("user_id", u.id),
          db
            .from("connection_challenges")
            .select(
              "id,connection_id,social_url,status,created_at,expires_at,review_note",
            )
            .eq("user_id", u.id),
          db
            .from("profile_ratings")
            .select("profile_id,score,created_at,updated_at")
            .eq("user_id", u.id),
          db.from('profile_reviews').select('profile_id,author_name,body,score,status,created_at,updated_at').eq('user_id',u.id),
          db.from('promo_admissions').select('profile_id,social_platform_id,social_url,slot,granted_at').eq('user_id',u.id),
          db.from('review_replies').select('review_id,author_name,body,status,created_at,updated_at').eq('user_id',u.id),
          db.from('review_reactions').select('review_id,reply_id,emoji,created_at').eq('user_id',u.id),
          db.from('dodo_orders').select('*').eq('user_id',u.id),
          db.from('service_requests').select('*').eq('user_id',u.id),
          db.from('moderation_decisions').select('id,profile_id,action,reason,rule,payment_impact,automated,appeal_until,created_at').eq('user_id',u.id),
          db.from('account_acceptance_history').select('*').eq('user_id',u.id),
        ]);
      return new NextResponse(
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            email: u.email,
            profiles: checked(p),
            payments: checked(pay),
            deletion_requests: checked(reports),
            social_connections: checked(connections),
            verification_requests: checked(challenges),
            ratings: checked(ratings),
            reviews: checked(reviews),
            promo_admissions: checked(promoAdmissions),
            review_replies: checked(replies),
            review_reactions: checked(reactions),dodo_payments:checked(dodo),service_requests:checked(requests),moderation_decisions:checked(decisions),consents:checked(consents),
          },
          null,
          2,
        ),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": 'attachment; filename="fameriser-export.json"',
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (route === "account/delete" && method === "POST") {
      const u = await getUser();if(!u?.email_confirmed_at)throw new HttpError(401,"Přihlas se účtem s potvrzeným e-mailem, nebo napiš na info@fameriser.com.");
      const v = await body(req);
      if (v.confirm !== "SMAZAT")
        throw new HttpError(400, "Potvrď odstranění účtu slovem SMAZAT.");
      await rate("delete:" + u.id, 10, 3600);
      const request=checked(await db.rpc('request_account_erasure',{p_user:u.id}));
      return json({
        message:
          "Účet byl zablokován pro další změny, profily skryty a propojení i příspěvky odstraněny. Žádost o dokončení výmazu je evidována; správce posoudí nezbytné lhůty uchování dokladů.",
        request_id:request.id,
      });
    }
    if (route === "verification" && method === "POST") {
      throw new HttpError(410, "Ověření nyní najdeš v sekci Propojené účty.");
    }
    if (route === "admin" && method === "GET") {
      await admin();
      const tables = [
        "profiles",
        "payments",
        "reports",
        "app_settings",
        "categories",
        "social_platforms",
        "admin_actions",
        "deletion_requests",
        "verification_requests",
        "social_connections",
        "connection_challenges",
      ];
      const data = await Promise.all(
        tables.map((t) => db.from(t).select("*").limit(300)),
      );
      return json(
        Object.fromEntries(tables.map((t, i) => [t, checked(data[i])])),
      );
    }
    if (route === "admin" && method === "POST") {
      const u = await admin();
      await rate("admin:" + u.id, 60, 60);
      const v = await body(req);
      if(['moderate','edit','ban'].includes(v.action))throw new HttpError(409,'Použij odůvodněné rozhodnutí v části Moderace a žádosti.');
      const actions = [
        "moderate",
        "edit",
        "ban",
        "report",
        "settings",
        "taxonomy",
        "connection_approve",
        "connection_reject",
      ];
      if (!actions.includes(v.action))
        throw new HttpError(400, "Neplatná administrátorská akce.");
      if (v.action.startsWith("connection_"))
        throw new HttpError(410, "Původní ověření přes bio bylo ukončeno. Nové ověření zprávou zatím není aktivní.");
      const result = await db.rpc("admin_mutation", {
        p_admin: u.id,
        p_action: v.action,
        p_target: v.id || null,
        p_value: v.value || {},
      });
      if (result.error)
        throw new HttpError(
          400,
          "Změnu nelze uložit. Zkontroluj hodnoty a oprávnění.",
        );
      return json({ ok: true });
    }
    if (route === "admin/refund" && method === "POST") {
      const u = await admin();
      const v = await body(req);
      const conf = checked(
        await db
          .from("app_settings")
          .select("value")
          .eq("key", "payments")
          .single(),
      );
      if (!conf.value.refunds_enabled)
        throw new HttpError(403, "Manuální refundace nejsou povolené.");
      const p = checked(
        await db.from("payments").select("*").eq("id", v.id).single(),
      );
      if (p.status !== "paid" || !p.stripe_payment_id)
        throw new HttpError(409, "Platbu nelze refundovat.");
      const refund = await stripe().refunds.create(
        { payment_intent: p.stripe_payment_id },
        { idempotencyKey: "full-refund-" + p.id },
      );
      checked(
        await db.from("admin_actions").insert({
          admin_id: u.id,
          action: "refund_requested",
          target_id: p.id,
          payload: { stripe_refund_id: refund.id },
        }),
      );
      return json({
        message: "Refundace odeslána do Stripe. Částka se upraví po webhooku.",
      });
    }
    throw new HttpError(404, "Tato operace neexistuje.");
  } catch (e) {
    if (e instanceof FacebookPagesError) return json({error:e.message},e.status);
    if (e instanceof ServiceError) return json({error:e.message},e.status);
    if (e instanceof NoticeError) return json({ error: e.message }, e.status);
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return json({ error: e.issues.map((x) => x.message).join(" ") }, 400);
    if (e instanceof Error && /HTTPS|odkaz|domén|profil|HTML/.test(e.message))
      return json({ error: e.message }, 400);
    console.error("API error", e instanceof Error ? e.name : "Unknown error");
    return json(
      { error: "Operaci se nepodařilo dokončit. Zkus to prosím znovu." },
      500,
    );
  }
}
