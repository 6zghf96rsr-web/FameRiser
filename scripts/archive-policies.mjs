// Generate one immutable version from the same text used by the application.
import {policies,POLICY_VERSION,SUPPORT_EMAIL} from '../lib/rankme/policies.ts';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const base='https://fameriser-legal.wgd7mb9ww2.chatgpt.site';
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const linked=s=>escape(s).replace(/https:\/\/[^\s<)]+/g,url=>{const clean=url.replace(/[.,;]$/,'');return '<a href="'+clean+'">'+clean+'</a>'+url.slice(clean.length);});
const filename=kind=>kind==='deletion'?'data-deletion.html':kind+'.html';
const labels={terms:'Podmínky',ranking:'Pořadí',refunds:'Reklamace a odstoupení',guidelines:'Komunitní pravidla',privacy:'Soukromí',cookies:'Cookies',deletion:'Odstranění údajů',promo:'Promo',contact:'Kontakt'};
const style='*{box-sizing:border-box}body{margin:0;color:#282336;background:#fcfcf8;font:17px/1.75 system-ui}main,header,footer{max-width:920px;margin:auto;padding:28px 24px}header{border-bottom:1px solid #ddd6e9}a{color:#6339ab;overflow-wrap:anywhere}a:focus-visible{outline:3px solid #6339ab;outline-offset:4px}.brand{font-size:24px;font-weight:800;text-decoration:none}h1{font-size:clamp(30px,6vw,46px);line-height:1.15;letter-spacing:-.03em}h2{font-size:22px;line-height:1.3}section{margin:36px 0}nav{display:flex;gap:12px 20px;flex-wrap:wrap;margin:20px 0;font-size:15px}.notice{background:#eff3d8;padding:20px;border-left:4px solid #839947}.meta,footer{font-size:14px;color:#625972}footer{border-top:1px solid #ddd6e9}.skip{position:absolute;top:-100px}.skip:focus{top:8px;background:white;padding:12px}.toc{padding:18px 0;border-block:1px solid #ddd6e9}li{margin:12px 0}p{overflow-wrap:anywhere}@media print{nav,.notice,.skip{display:none}body{background:white;font-size:12pt}main{max-width:none}section{break-inside:avoid}}';
const nav=Object.entries(labels).map(([kind,label])=>'<a href="'+base+'/'+filename(kind)+'">'+label+'</a>').join('');
const intro='Připravené znění pro soukromý pilot a budoucí službu. Ostré platby nejsou spuštěné. Promo se řídí dostupností v aplikaci. Identita provozovatele, konečné kontakty a smluvní nastavení Dodo budou doplněny před spuštěním. Zásady soukromí samostatně uvádějí dosud nedoložené záruky dodavatelů.';
function render(kind,doc){
 return '<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(doc.title)+' | FameRiser</title><style>'+style+'</style></head><body><a class="skip" href="#main">Přejít na obsah</a><header><a class="brand" href="'+base+'/">FameRiser · Dokumenty</a><nav aria-label="Právní dokumenty">'+nav+'</nav></header><main id="main"><h1>'+escape(doc.title)+'</h1><p class="meta">Verze '+POLICY_VERSION+' · 22. září 2026 · Veřejně dostupné bez přihlášení</p><aside class="notice">'+intro+'</aside><nav class="toc" aria-label="Obsah">'+doc.sections.map(([h],i)=>'<a href="#oddil-'+(i+1)+'">'+escape(h)+'</a>').join('')+'</nav>'+doc.sections.map(([h,t],i)=>'<section id="oddil-'+(i+1)+'"><h2>'+escape(h)+'</h2><p>'+linked(t)+'</p></section>').join('')+'<p><a href="'+base+'/archive/'+POLICY_VERSION+'/'+filename(kind)+'">Stálý odkaz na tuto verzi</a> · Dokument lze uložit nebo vytisknout v prohlížeči.</p></main><footer><p>Současný kontakt: <a href="mailto:'+SUPPORT_EMAIL+'">'+SUPPORT_EMAIL+'</a></p><p><a href="https://fameriser.com/requests">Žádosti a odstoupení</a> · <a href="https://fameriser.com/report">Nahlásit obsah</a> · <a href="https://fameriser.com/cookies">Změnit nastavení cookies v aplikaci</a></p><p>Formuláře hlavní aplikace jsou v soukromém pilotu dostupné jen jeho účastníkům. Bez přístupu použij e-mail; nové podmínky nemusíš přijmout k uplatnění svých práv.</p><nav>'+nav+'</nav></footer></body></html>';
}
const docs=Object.fromEntries(Object.entries(policies).map(([k,v])=>[k,render(k,v)]));
const manifest=Object.fromEntries(Object.entries(docs).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]));
const local=join(root,'public/legal',POLICY_VERSION);
const publicAt=process.argv.indexOf('--public-dir');
const publicDir=publicAt<0?null:resolve(process.argv[publicAt+1]||'');
if(publicAt>=0&&!process.argv[publicAt+1])throw Error('--public-dir requires a directory');
const archiveFiles=Object.entries(docs).map(([k,v])=>[join(local,k+'.html'),v]);
archiveFiles.push([join(local,'sha256.json'),JSON.stringify(manifest,null,2)+'\n']);
if(publicDir){
 for(const [k,v]of Object.entries(docs))archiveFiles.push([join(publicDir,'archive',POLICY_VERSION,filename(k)),v]);
 archiveFiles.push([join(publicDir,'archive',POLICY_VERSION,'sha256.json'),JSON.stringify(manifest,null,2)+'\n']);
}
// Validate every path before writing anything. Even old public archives must stay immutable.
for(const [path,body]of archiveFiles)if(existsSync(path)&&readFileSync(path,'utf8')!==body)throw Error('Refusing to replace immutable archive: '+path);
for(const [path,body]of archiveFiles){mkdirSync(resolve(path,'..'),{recursive:true});if(!existsSync(path))writeFileSync(path,body);}
writeFileSync(join(root,'lib/rankme/privacy-snapshot.json'),JSON.stringify({version:POLICY_VERSION,sha256:manifest.privacy,url:base+'/archive/'+POLICY_VERSION+'/privacy.html',html:docs.privacy},null,2)+'\n');
if(publicDir){
 for(const [k,v]of Object.entries(docs))writeFileSync(join(publicDir,filename(k)),v);
 const index=render('index',{title:'Pravidla, soukromí a pomoc',sections:[['Dokumenty na jednom místě','Zde najdeš podmínky služby, pravidla pořadí a promo míst, reklamace, komunitní pravidla, zásady soukromí, cookies a návod k odstranění údajů. Vyber dokument v navigaci nahoře. Hlavní aplikace zůstává soukromá.'],['Ochrana tvých práv','Žádost o výmaz, reklamaci, odstoupení nebo oznámení můžeš podat i bez dostupného přihlášení kontaktním e-mailem. Identitu ověřujeme jen v přiměřeném rozsahu.'],['Starší znění','Předchozí dokumenty zůstávají v archivu: '+base+'/archive/2026-09-17.1/terms.html a '+base+'/archive/2026-09-16/privacy.html']]});
 writeFileSync(join(publicDir,'index.html'),index.replace('<p><a href="'+base+'/archive/'+POLICY_VERSION+'/index.html">Stálý odkaz na tuto verzi</a> · Dokument lze uložit nebo vytisknout v prohlížeči.</p>',''));
}
console.log(JSON.stringify({version:POLICY_VERSION,documents:Object.keys(docs).length,publicUpdated:Boolean(publicDir)}));
