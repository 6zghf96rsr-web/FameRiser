import { z } from 'zod';

export const noticeReasons = [
  ['impersonation', 'Vydávání se za jinou osobu'],
  ['copyright', 'Porušení autorských práv'],
  ['trademark', 'Porušení ochranné známky'],
  ['scam', 'Podvod'],
  ['threats', 'Výhrůžky'],
  ['hate', 'Nenávist nebo obtěžování'],
  ['sexual', 'Sexuální obsah'],
  ['illegal', 'Jiný nezákonný obsah'],
  ['privacy', 'Porušení soukromí'],
  ['other', 'Jiný důvod'],
] as const;
export const reasonLabel = (reason: string) => noticeReasons.find(([key]) => key === reason)?.[1] || reason;
export const MAX_NOTICE_FILES = 3;
export const MAX_NOTICE_FILE_SIZE = 2 * 1024 * 1024;
export const MAX_NOTICE_BODY = 7 * 1024 * 1024;
const text = z.string().trim().refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v), 'Text obsahuje nepovolené řídicí znaky.');
export const noticeInput = z.object({
  request_id: z.string().uuid(),
  content_url: z.string().trim().url('Zadej úplný odkaz na obsah.').max(2000),
  reason: z.enum(noticeReasons.map(([key]) => key) as [string, ...string[]]),
  details: text.pipe(z.string().min(20, 'Popiš konkrétní problém alespoň 20 znaky.').max(10000)),
  reporter_name: text.pipe(z.string().max(150)),
  reporter_email: z.union([z.literal(''), z.string().trim().max(254).email('Zadej platný e-mail.')]),
  child_safety: z.boolean(),
  good_faith: z.literal(true, { errorMap: () => ({ message: 'Potvrď prosím prohlášení o dobré víře.' }) }),
}).strict().superRefine((v, ctx) => {
  if (!v.child_safety && v.reporter_name.length < 2) ctx.addIssue({ code: 'custom', path: ['reporter_name'], message: 'Zadej jméno nebo název organizace.' });
  if (!v.child_safety && !v.reporter_email) ctx.addIssue({ code: 'custom', path: ['reporter_email'], message: 'Zadej kontaktní e-mail.' });
  if (v.child_safety && v.reason !== 'sexual') ctx.addIssue({ code: 'custom', path: ['child_safety'], message: 'Výjimka z kontaktních údajů patří k oznámení sexuálního zneužívání dětí.' });
});

// Exact locations are retained, including comment anchors. Never fetch a reporter-supplied URL.
export function noticeURL(value: string, appURL: string) {
  const url = new URL(value);
  const app = new URL(appURL);
  const origins = new Set([app.origin, 'https://fameriser.com', 'https://www.fameriser.com', 'https://rankme-creator-board.wgd7mb9ww2.chatgpt.site']);
  if (!origins.has(url.origin) || url.username || url.password || !['http:', 'https:'].includes(url.protocol) || url.pathname === '/' || /[\u0000-\u0020]/.test(value))
    throw new Error('Zadej přesný odkaz na obsah na FameRiser. Odkaz na původní sociální síť můžeš uvést v popisu.');
  return url.toString();
}
export function attachmentType(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0,5)) === '%PDF-') return 'application/pdf';
  return null;
}
export function attachmentName(name: string) { return name.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0,100) || 'priloha'; }
export function noticeCase(number: number | string) { return `FR-${String(number).padStart(7,'0')}`; }
export function receiptText(caseId: string, createdAt: string) {
  return `FameRiser — potvrzení přijetí oznámení\n\nČíslo případu: ${caseId}\nPřijato: ${new Date(createdAt).toISOString()}\n\nOznámení bylo uloženo k posouzení. Toto potvrzení neznamená, že obsah byl shledán nezákonným. O výsledku a možnostech přezkumu vás budeme informovat na uvedeném kontaktním e-mailu.\n\nPři další komunikaci uveďte číslo případu. Kontakt: info@fameriser.com`;
}

export async function boundedFormData(req: Request) {
  if (!req.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new Error('Neplatný formát oznámení.');
  const reader = req.body?.getReader();
  if (!reader) throw new Error('Oznámení je prázdné.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_NOTICE_BODY) { await reader.cancel(); throw new Error('Přílohy jsou příliš velké. Nejvýše 3 soubory po 2 MB.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(bytes, { headers: { 'Content-Type': req.headers.get('content-type')! } }).formData();
}
