export const PRIVATE_RULES_VERSION = '2026-10-03.2';
// Verified against the Ministry of Finance ARES record for IČO 87155982.
export const PRIVATE_OPERATOR = {
  name:'Petr Suchý',
  ico:'87155982',
  address:'Československé armády 723, Místek, 738 01 Frýdek-Místek, Česká republika',
} as const;
export const privateCoreEnabled = () => process.env.CORE_V1_PRIVATE_ENABLED === 'true';
export const privateEmailUser = (user:{email_confirmed_at?:string|null;app_metadata?:{provider?:string}}|null) =>
  Boolean(user?.email_confirmed_at&&user.app_metadata?.provider==='email');
export const privatePilotReady = () => privateCoreEnabled() &&
  Boolean(process.env.SUPPORT_EMAIL) &&
  process.env.LEGAL_REVIEW_APPROVED === 'true' &&
  process.env.LEGAL_REVIEW_APPROVED_VERSION === PRIVATE_RULES_VERSION;

export type PrivateBoardRow = {
  rank: number;
  creator_id: string;
  display_name: string;
  country: string | null;
  cash_usd_minor: number;
  fc: number;
  combined_usd_minor: number;
  attained_at: string;
  accounts: {provider:string;label:string;url:string;category:string|null}[];
};
export type PrivateBoard = {
  rules_version: string;
  period: 'all_time'|'daily'|'weekly';
  period_start: string|null;
  as_of: string;
  projection_revision: number;
  rows: PrivateBoardRow[];
};
export type PrivateOwner = {
  creator_id:string;
  display_name:string;
  country:string|null;
  publish_requested:boolean;
  fc:number;
  accounts:{id:string;provider:string;label:string;url:string;category:string|null;active:boolean}[];
};
