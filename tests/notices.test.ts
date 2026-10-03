import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noticeInput, noticeURL, attachmentType, attachmentName, boundedFormData, MAX_NOTICE_BODY } from '../lib/rankme/notices';
const valid={request_id:crypto.randomUUID(),content_url:'https://fameriser.com/p/alice#review-123',reason:'copyright',details:'Konkrétní fotografie porušuje má autorská práva.',reporter_name:'Test reporter',reporter_email:'reporter@example.test',child_safety:false,good_faith:true};
test('ordinary notices require name, contact, substance and good faith',()=>{
  assert(noticeInput.safeParse(valid).success);
  for(const patch of [{reporter_name:''},{reporter_email:''},{reporter_email:'x\n@example.com'},{details:'short'},{good_faith:false},{reason:'made-up'},{status:'resolved'}])assert(!noticeInput.safeParse({...valid,...patch}).success);
});
test('only child sexual safety notices can omit contact details',()=>{
  assert(noticeInput.safeParse({...valid,reason:'sexual',child_safety:true,reporter_name:'',reporter_email:''}).success);
  assert(!noticeInput.safeParse({...valid,child_safety:true,reporter_name:'',reporter_email:''}).success);
});
test('exact URL anchors retained; external links, credentials and protocol tricks rejected',()=>{
  assert.equal(noticeURL(valid.content_url,'https://fameriser.com'),valid.content_url);
  for(const url of ['https://fameriser.com.evil.test/p/a','https://evil.test/p/a','https://u:p@fameriser.com/p/a','javascript:alert(1)','http://fameriser.com/p/a','https://fameriser.com/']) assert.throws(()=>noticeURL(url,'https://fameriser.com'));
});
test('attachment signatures distinguish images and PDF from renamed HTML/SVG',()=>{
  assert.equal(attachmentType(new Uint8Array([137,80,78,71,13,10,26,10])),'image/png');
  assert.equal(attachmentType(new Uint8Array([255,216,255,224])),'image/jpeg');
  assert.equal(attachmentType(new TextEncoder().encode('%PDF-1.4')),'application/pdf');
  assert.equal(attachmentType(new TextEncoder().encode('<svg onload="alert(1)">')),null);
  assert(!attachmentName('../../bad\r\nname.pdf').includes('/'));
});
test('multipart reading limits actual bytes, even without content length',async()=>{
  const form=new FormData();form.append('notice',JSON.stringify(valid));
  const parsed=await boundedFormData(new Request('https://fameriser.com/api/notices',{method:'POST',body:form}));
  assert.equal(parsed.get('notice'),JSON.stringify(valid));
  await assert.rejects(()=>boundedFormData(new Request('https://fameriser.com/api/notices',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=x'},body:new Uint8Array(MAX_NOTICE_BODY+1)})),/velké/);
});

import { receiveNotice, sendNoticeReceipt } from '../lib/rankme/notices-server';
function fakeDB() {
  const rows:any[]=[], uploads:string[]=[], removed:string[]=[];
  let failInsert=false;
  const db:any={
    from:()=>({
      select:()=>({eq:(_key:string,value:string)=>({maybeSingle:async()=>({data:rows.find(r=>r.request_id===value)||null,error:null})})}),
      insert:(value:any)=>({select:()=>({single:async()=>{
        if(failInsert)return {data:null,error:{code:'XX000'}};
        const row={...value,case_number:rows.length+1,created_at:new Date().toISOString()};rows.push(row);return {data:row,error:null};
      }})}),
    }),
    storage:{from:()=>({upload:async(path:string)=>{uploads.push(path);return {data:{path},error:null}},remove:async(paths:string[])=>{removed.push(...paths);return {data:{},error:null}}})},
  };
  return {db,rows,uploads,removed,fail:()=>{failInsert=true}};
}
function noticeRequest(value:any, file?:File) {
  const form=new FormData();form.set('notice',JSON.stringify(value));if(file)form.append('files',file);
  return new Request('https://fameriser.com/api/notices',{method:'POST',body:form});
}
test('notice submission survives absent email config, deduplicates retries, and never exposes private fields',async()=>{
  const state=fakeDB(); const before={app:process.env.APP_URL,key:process.env.NOTICES_RESEND_API_KEY};
  process.env.APP_URL='https://fameriser.com';delete process.env.NOTICES_RESEND_API_KEY;
  try{
    const file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'proof.png',{type:'image/png'});
    const first=await receiveNotice(noticeRequest(valid,file),'private-hash',state.db);
    const repeated=await receiveNotice(noticeRequest(valid,file),'another-hash',state.db);
    assert.deepEqual(first,repeated);assert.equal(state.rows.length,1);assert.equal(state.uploads.length,1);
    assert.equal(first.receipt_state,'pending');assert.deepEqual(Object.keys(first).sort(),['case_id','created_at','receipt_state']);
    await assert.rejects(()=>receiveNotice(noticeRequest({...valid,reporter_email:'different@example.test'},file),'hash',state.db),/změnilo/);
  }finally{if(before.app===undefined)delete process.env.APP_URL;else process.env.APP_URL=before.app;if(before.key===undefined)delete process.env.NOTICES_RESEND_API_KEY;else process.env.NOTICES_RESEND_API_KEY=before.key;}
});
test('failed insert cleans uploaded evidence; child safety and forged mime fail before uploading',async()=>{
  const state=fakeDB();const before=process.env.APP_URL;process.env.APP_URL='https://fameriser.com';
  try{
    const file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'proof.png',{type:'image/png'});
    await assert.rejects(()=>receiveNotice(noticeRequest({...valid,reason:'sexual',child_safety:true},file),'hash',state.db),/nepovolené/);
    await assert.rejects(()=>receiveNotice(noticeRequest(valid,new File(['<svg>'],'proof.png',{type:'image/png'})),'hash',state.db),/správným typem/);
    assert.equal(state.uploads.length,0);
    state.fail();await assert.rejects(()=>receiveNotice(noticeRequest(valid,file),'hash',state.db));
    assert.deepEqual(state.removed,state.uploads);assert.equal(state.rows.length,0);
  }finally{if(before===undefined)delete process.env.APP_URL;else process.env.APP_URL=before;}
});
test('failed email delivery stays pending and does not claim sent',async()=>{
  const oldFetch=globalThis.fetch,beforeKey=process.env.NOTICES_RESEND_API_KEY,beforeFrom=process.env.NOTICES_FROM_EMAIL;
  process.env.NOTICES_RESEND_API_KEY='test-key';process.env.NOTICES_FROM_EMAIL='test@example.test';
  globalThis.fetch=async()=>new Response('{}',{status:503});
  try{assert.equal(await sendNoticeReceipt({id:crypto.randomUUID(),reporter_email:'reporter@example.test',receipt_state:'pending',case_number:1,created_at:new Date().toISOString()},{} as any),'pending')}
  finally{globalThis.fetch=oldFetch;if(beforeKey===undefined)delete process.env.NOTICES_RESEND_API_KEY;else process.env.NOTICES_RESEND_API_KEY=beforeKey;if(beforeFrom===undefined)delete process.env.NOTICES_FROM_EMAIL;else process.env.NOTICES_FROM_EMAIL=beforeFrom;}
});
