import { z } from 'zod';
import { POLICY_VERSION } from './policies';

export const facebookPageConsent = z.object({accepted:z.literal(true),non_political:z.literal(true),version:z.literal(POLICY_VERSION)}).strict();

export type FacebookPage = { id: string; name: string; social_url: string; avatar_url: string | null; category: string | null };
// Read/advertising/analytics access alone is not proof of authority to represent a Page.
const managementTasks = new Set(['MANAGE', 'CREATE_CONTENT', 'PROFILE_PLUS_FULL_CONTROL', 'PROFILE_PLUS_MANAGE', 'PROFILE_PLUS_FACEBOOK_ACCESS', 'PROFILE_PLUS_CREATE_CONTENT']);
export const facebookPageId = z.string().regex(/^\d{1,40}$/);
export const facebookPageCursor = z.string().min(1).max(2048);
export function facebookPageList(payload: unknown): { pages: FacebookPage[]; after: string | null } {
  const result = z.object({
    data: z.array(z.object({ id: facebookPageId, name: z.string().trim().min(1).max(200), tasks: z.array(z.string()), category: z.string().max(300).optional(), picture: z.object({data:z.object({url:z.string().optional()})}).optional() })).max(100),
    paging: z.object({next:z.string().optional(),cursors:z.object({after:facebookPageCursor.optional()}).optional()}).optional(),
  }).parse(payload);
  return {
    pages: result.data.filter(p=>p.tasks.some(task=>managementTasks.has(task))).map(p=>({
      id:p.id,name:p.name,social_url:`https://facebook.com/${p.id}`,category:p.category || null,
      avatar_url: safePagePicture(p.picture?.data.url),
    })),
    // Never fetch a next URL from the provider response: it can contain credentials.
    after: result.paging?.next ? result.paging.cursors?.after || null : null,
  };
}
function safePagePicture(raw?:string) {
  if(!raw) return null;
  try {const u=new URL(raw);return u.protocol==='https:' && !u.username && !u.password && ![...u.searchParams.keys()].some(k=>/token|secret/i.test(k)) ? u.href : null;} catch{return null;}
}
