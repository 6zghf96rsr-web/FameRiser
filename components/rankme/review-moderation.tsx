"use client";
import {useEffect,useState} from 'react';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Button} from '@/components/ui/button';
import {api} from './join-form';
export function ReviewModeration({demo}:{demo:boolean}){
 const [kind,setKind]=useState('reviews');
 const [status,setStatus]=useState('pending'),[page,setPage]=useState(1),[data,setData]=useState<any>({items:[],count:0}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(()=>{if(demo)return;let alive=true;setBusy(true);setError('');api(`admin/${kind}?status=${status}&page=${page}`).then(r=>{if(alive)setData(r)}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setBusy(false)});return()=>{alive=false}},[kind,status,page,demo,refresh]);
 const moderate=async(id:string,next:string)=>{setBusy(true);setError('');try{await api(`admin/${kind}`,{id,status:next});setRefresh(n=>n+1)}catch(e){setError((e as Error).message);setBusy(false)}};
 return <section className="review-moderation"><h2 className="tab-title">Kontrola komentářů a odpovědí</h2><p>Posuzuj spam, útoky a osobní údaje. Kritiku tvorby ani nízké hvězdičky samotné neskrývej.</p><Tabs value={kind} onValueChange={v=>{setKind(v);setPage(1)}}><TabsList><TabsTrigger value="reviews">Komentáře</TabsTrigger><TabsTrigger value="replies">Odpovědi</TabsTrigger></TabsList></Tabs><Tabs value={status} onValueChange={v=>{setStatus(v);setPage(1)}}><TabsList>{[['pending','Čekající'],['published','Zveřejněné'],['hidden','Skryté']].map(([v,l])=><TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList></Tabs>
 {error&&<p role="alert" className="form-error">{error}</p>}
 {!data.items.length&&<p className="notice">{demo?'Demo moderace bez skutečných komentářů.':'Žádné komentáře v tomto výběru.'}</p>}
 {data.items.map((r:any)=><article className="moderation-review" key={r.id}><strong>{r.author_name} · {kind==='replies'?'odpověď':r.score?`${r.score} ★`:'bez hvězdiček'}</strong><p>{r.body}</p>{kind==='replies'&&<blockquote>Původní komentář od {r.profile_reviews?.author_name}: {r.profile_reviews?.body}</blockquote>}<small>Profil: {r.profile_id||r.profile_reviews?.profile_id} · {kind==='replies'?'Odpověď':'Komentář'}: {r.id}</small><div className="rating-actions">{r.status!=='published'&&<Button disabled={busy||demo} onClick={()=>void moderate(r.id,'published')}>Zveřejnit</Button>}{r.status!=='hidden'&&<Button disabled={busy||demo} variant="outline" onClick={()=>void moderate(r.id,'hidden')}>Skrýt</Button>}</div></article>)}
 {data.count>20&&<nav className="review-pagination"><Button disabled={busy||page===1} onClick={()=>setPage(p=>p-1)}>Předchozí</Button><span>{page} / {Math.ceil(data.count/20)}</span><Button disabled={busy||page*20>=data.count} onClick={()=>setPage(p=>p+1)}>Další</Button></nav>}
 </section>
}
