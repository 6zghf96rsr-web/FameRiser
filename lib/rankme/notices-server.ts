import {dispatchMail,mailConfigured} from "./mail";
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { attachmentName, attachmentType, boundedFormData, MAX_NOTICE_FILES, MAX_NOTICE_FILE_SIZE, noticeCase, noticeInput, noticeURL, receiptText } from './notices';

export class NoticeError extends Error { constructor(public status: number, message: string) { super(message); } }
function result<T extends { data: any; error: any }>(response: T) {
  if (response.error) throw new NoticeError(503, 'Oznámení se nyní nepodařilo zpracovat. Zkus to znovu nebo kontaktuj info@fameriser.com.');
  return response.data;
}
export async function sendNoticeReceipt(row: any, db: SupabaseClient) {
  if (!row.reporter_email || ['sent','manual','not_requested'].includes(row.receipt_state)) return row.receipt_state;
  if(!await mailConfigured(db))return 'pending';
  try {await dispatchMail(db);const r=await db.from('content_notices').select('receipt_state').eq('id',row.id).single();return r.error?'pending':r.data.receipt_state;}catch{return 'pending';}
}
export async function receiveNotice(req: Request, hash: string, db: SupabaseClient) {
  let form: FormData;
  try { form = await boundedFormData(req); } catch (error) { throw new NoticeError(400,(error as Error).message); }
  const raw = form.get('notice');
  if (typeof raw !== 'string' || raw.length > 20000) throw new NoticeError(400,'Neplatné oznámení.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new NoticeError(400,'Neplatné oznámení.'); }
  const value = noticeInput.parse(parsed);
  try { value.content_url = noticeURL(value.content_url, process.env.APP_URL!); } catch (error) { throw new NoticeError(400,(error as Error).message); }
  const entries = form.getAll('files');
  if (entries.length > MAX_NOTICE_FILES || (value.child_safety && entries.length)) throw new NoticeError(400,'Toto oznámení obsahuje nepovolené přílohy.');
  const files: { bytes: Uint8Array; name: string; type: string; hash: string }[] = [];
  for (const file of entries) {
    if (typeof file === 'string' || file.size < 1 || file.size > MAX_NOTICE_FILE_SIZE) throw new NoticeError(400,'Každá příloha musí být neprázdná a nejvýše 2 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = attachmentType(bytes);
    if (!type || type !== file.type) throw new NoticeError(400,'Příloha musí být PNG, JPG nebo PDF se správným typem souboru.');
    files.push({ bytes, type, name: attachmentName(file.name), hash: createHash('sha256').update(bytes).digest('hex') });
  }
  const payloadHash = createHash('sha256').update(JSON.stringify({ value, files: files.map(({name,type,hash})=>({name,type,hash})) })).digest('hex');
  async function duplicate() {
    const row = result(await db.from('content_notices').select('*').eq('request_id',value.request_id).maybeSingle());
    if (row && row.payload_hash !== payloadHash) throw new NoticeError(409,'Oznámení se od posledního odeslání změnilo. Obnov formulář a odešli je znovu.');
    return row;
  }
  let row = await duplicate();
  if (!row) {
    const id = crypto.randomUUID();
    const attachments: { path: string; name: string; size: number; type: string }[] = [];
    try {
      for (const file of files) {
        const path = `${id}/${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'pdf'}`;
        result(await db.storage.from('notice-evidence').upload(path, file.bytes, { contentType:file.type, upsert:false }));
        attachments.push({ path, name:file.name, size:file.bytes.byteLength, type:file.type });
      }
      const inserted = await db.from('content_notices').insert({ ...value, id, payload_hash:payloadHash, reporter_hash:hash, attachments, receipt_state: value.reporter_email ? 'pending' : 'not_requested' }).select('*').single();
      if (inserted.error?.code === '23505') {
        if (attachments.length) await db.storage.from('notice-evidence').remove(attachments.map(a=>a.path));
        row = await duplicate();
        if (!row) throw new NoticeError(503,'Oznámení se nepodařilo uložit.');
      } else row = result(inserted);
    } catch (error) {
      if (attachments.length) await db.storage.from('notice-evidence').remove(attachments.map(a=>a.path));
      throw error;
    }
  }
  const receipt_state = await sendNoticeReceipt(row,db);
  return { case_id:noticeCase(row.case_number), created_at:row.created_at, receipt_state };
}
export async function noticeAdmin(req: Request, adminID: string, segments: string[], db: SupabaseClient) {
  if (req.method === 'GET' && segments.length === 2) {
    const query = new URL(req.url).searchParams;
    const page = z.coerce.number().int().min(1).max(100000).parse(query.get('page') || '1');
    const state = z.enum(['open','reviewing','resolved','all']).parse(query.get('status') || 'open');
    let selection = db.from('content_notices').select('id,case_number,content_url,reason,details,reporter_name,reporter_email,child_safety,good_faith,attachments,status,receipt_state,receipt_sent_at,decision,redress,decision_sent_at,created_at', { count:'exact' });
    if (state !== 'all') selection = selection.eq('status',state);
    const response = await selection.order('created_at',{ascending:true}).order('id').range((page-1)*50,page*50-1);
    return { items:result(response), count:response.count, page, mail_configured:Boolean(process.env.NOTICES_RESEND_API_KEY && process.env.NOTICES_FROM_EMAIL) };
  }
  if (req.method === 'GET' && segments.length === 5 && segments[3] === 'attachment') {
    const id = z.string().uuid().parse(segments[2]);
    const index = z.coerce.number().int().min(0).max(2).parse(segments[4]);
    const notice = result(await db.from('content_notices').select('attachments').eq('id',id).single());
    const file = notice.attachments[index];
    if (!file || !file.path.startsWith(id+'/')) throw new NoticeError(404,'Příloha nebyla nalezena.');
    const downloaded = await db.storage.from('notice-evidence').download(file.path);
    const blob = result(downloaded) as Blob;
    // Untrusted attachments are downloads only, never embedded in the application origin.
    return new Response(blob,{ headers:{ 'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="evidence-${index+1}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Cache-Control':'no-store' } });
  }
  if (req.method === 'POST' && segments.length === 2) {
    const raw = await req.text();
    if (raw.length > 20000) throw new NoticeError(413,'Požadavek je příliš velký.');
    let input: unknown; try { input = JSON.parse(raw); } catch { throw new NoticeError(400,'Neplatný požadavek.'); }
    const v = z.object({ id:z.string().uuid(), action:z.enum(['reviewing','decision','receipt_sent','decision_sent','retry_receipt']), decision:z.string().trim().min(20).max(10000).optional(), redress:z.string().trim().min(10).max(5000).optional() }).strict().parse(input);
    if (v.action === 'retry_receipt') {
      const row = result(await db.from('content_notices').select('*').eq('id',v.id).single());
      return { receipt_state:await sendNoticeReceipt(row,db) };
    }
    if (v.action === 'decision' && (!v.decision || !v.redress)) throw new NoticeError(400,'Doplň rozhodnutí, důvody a možnosti přezkumu.');
    result(await db.rpc('update_content_notice',{ p_admin:adminID,p_id:v.id,p_action:v.action,p_value:{decision:v.decision,redress:v.redress} }));
    return { ok:true };
  }
  throw new NoticeError(404,'Požadavek nebyl nalezen.');
}
