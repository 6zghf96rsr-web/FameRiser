import { publicProfile } from './public-profile';
import {
  adminDB,
  configured,
  demoEnabled,
  publicConfig,
} from "@/lib/supabase/server";
import { APP, Profile, Settings, orderProfiles } from "./config";
import { demoProfiles } from "./demo";
async function loadPublicProfiles(db: ReturnType<typeof adminDB>) {
  const profiles: Profile[] = [];
  // PostgREST caps individual responses. Read every batch rather than silently
  // losing profiles after position 1000; the UI renders only 10 or 100 at once.
  for (let offset = 0; ; offset += 1000) {
    const result = await db.rpc("get_commerce_board").range(offset, offset + 999);
    if (result.error) throw result.error;
    const batch = (result.data || []) as Profile[];
    profiles.push(...batch);
    if (batch.length < 1000) return profiles;
  }
}
export async function getBoard() {
  if (demoEnabled())
    return {
      profiles: demoProfiles,
      settings: {
        name: APP.name,
        promo_enabled: true,
        minimum: APP.minimum,
        increment: APP.increment,
      } as Settings,
      demo: true,
      config: publicConfig(),
      activity: [],
      error: null,
    };
  if (!configured())
    return {
      profiles: [] as Profile[],
      settings: {
        name: APP.name,
        minimum: APP.minimum,
        increment: APP.increment,
      } as Settings,
      demo: false,
      config: publicConfig(),
      activity: [],
      error: "Žebříček zatím není připojený k databázi.",
    };
  try {
    const db = adminDB();
    const [board, setting, activity] = await Promise.all([
      loadPublicProfiles(db),
      db.from("app_settings").select("value").eq("key", "public").single(),
      db
        .from("activity")
        .select("id,profile_id,kind,payload,created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (setting.error) throw setting.error;
    const profiles = orderProfiles(board.map(publicProfile));
    return {
      profiles,
      settings: setting.data.value as Settings,
      demo: false,
      config: publicConfig(),
      activity: (activity.data || []).map(event => ({...event,payload:{rank:event.payload?.rank}})).filter(
        (event) =>
          !event.profile_id ||
          profiles.some((p: Profile) => p.id === event.profile_id),
      ),
      error: null,
    };
  } catch (e) {
    console.error(
      "Leaderboard unavailable",
      e instanceof Error ? e.message : "Database error",
    );
    return {
      profiles: [] as Profile[],
      settings: {
        name: APP.name,
        minimum: APP.minimum,
        increment: APP.increment,
      } as Settings,
      demo: false,
      config: publicConfig(),
      activity: [],
      error: "Žebříček se nepodařilo načíst. Zkus to prosím za chvíli.",
    };
  }
}
export async function getProfile(slug: string) {
  const b = await getBoard();
  const p = orderProfiles(b.profiles).find((p) => p.slug === slug);
  if (!p) return null;
  let history: any[] = [];
  if (!b.demo) {
    const result = await adminDB()
      .from("rank_history")
      .select("old_rank,new_rank,created_at")
      .eq("profile_id", p.id)
      .order("created_at", { ascending: false })
      .limit(50);
    history = result.data || [];
  }
  return { ...b, profile: p, history };
}

// Board routes never load the full list into the Worker or the browser.
export async function getBoardPage(request: import('./board-page').BoardRequest) {
 const {demoBoardPage,emptyBoardMeta}=await import('./board-page');
 const base=await getBoardSettings();
 if(base.demo)return {...base,...demoBoardPage(demoProfiles,request),activity:[],error:null};
 try{
  if(!configured())throw new Error('Database unavailable');
  const db=adminDB();
  const {data,error}=await db.rpc('get_board_page',{p_options:request});
  if(error)throw error;
  const profiles=(data.profiles as Profile[]).map(publicProfile);
  const events=profiles.length?await db.from('activity').select('id,profile_id,kind,payload,created_at').in('profile_id',profiles.map(p=>p.id)).order('created_at',{ascending:false}).limit(10):{data:[]};
  return {...base,profiles,meta:data.meta as import('./board-page').BoardMeta,activity:(events.data||[]).map(e=>({...e,payload:{rank:e.payload?.rank}})),error:null};
 }catch(e){
  console.error('Paged leaderboard unavailable',e instanceof Error?e.message:'Database error');
  return {...base,profiles:[] as Profile[],meta:emptyBoardMeta(request),activity:[],error:'Žebříček se nepodařilo načíst. Zkus to prosím za chvíli.'};
 }
}
export async function getBoardSettings(){
 let settings:Settings={name:APP.name,minimum:APP.minimum,increment:APP.increment};
 if(configured()&&!demoEnabled()){
  const result=await adminDB().from('app_settings').select('value').eq('key','public').single();
  if(!result.error)settings=result.data.value as Settings;
 }
 return {settings,demo:demoEnabled(),config:publicConfig()};
}
