import { z } from "zod";
import { platforms } from "./config";
import { safeSocialURL } from "./validation";

export const connectionInput = z
  .object({
    platform: z.enum(platforms),
    social_url: z.string().max(500),
    ownership: z.literal(true),
  })
  .strict();

// Canonical account addresses, never post/share/redirect addresses.
export function accountURL(
  raw: string,
  platform: string,
  blacklist: string[] = [],
  allowed: string[] = [],
) {
  const u = new URL(safeSocialURL(raw, platform, blacklist, allowed));
  let path: string;
  try {
    path = decodeURIComponent(u.pathname).replace(/\/+$/, "");
  } catch {
    throw new Error("Neplatná adresa profilu.");
  }
  if (/[\\?#\u0000-\u0020]/.test(path))
    throw new Error("Neplatná adresa profilu.");
  const rules: Record<string, RegExp> = {
    Instagram: /^\/[\w.]{1,30}$/,
    TikTok: /^\/@[\w.]{1,30}$/,
    YouTube:
      /^\/(?:@[\p{L}\p{N}._-]+|channel\/UC[\w-]{22}|(?:c|user)\/[\w.-]+)$/u,
    X: /^\/\w{1,15}$/,
    Facebook: /^\/(?:[\w.-]+|app_scoped_user_id\/[A-Za-z0-9_-]{1,400}|people\/[^/]+\/\d{1,40})$/,
    Twitch: /^\/\w{1,25}$/,
    LinkedIn: /^\/(?:in|company)\/[\p{L}\p{N}._-]+$/u,
    Threads: /^\/@[\w.]+$/,
    Snapchat: /^\/add\/[\w.-]+$/,
    Pinterest: /^\/[\w.-]+$/,
    Kick: /^\/[\w-]+$/,
    Reddit: /^\/(?:user|u)\/[\w-]+$/,
  };
  const reserved = new Set([
    "p",
    "reel",
    "reels",
    "explore",
    "accounts",
    "stories",
    "watch",
    "shorts",
    "live",
    "home",
    "search",
    "settings",
    "messages",
    "notifications",
    "i",
    "feed",
    "pin",
    "directory",
    "login",
    "signup",
    "help",
    "privacy",
    "terms",
  ]);
  if (
    reserved.has(path.split("/")[1]?.toLowerCase()) ||
    (rules[platform] && !rules[platform].test(path))
  )
    throw new Error("Vlož adresu účtu nebo kanálu, nikoli příspěvku či videa.");
  if (platform === "Facebook" && path === "/profile.php") {
    const id = u.searchParams.get("id");
    if (!id || !/^\d+$/.test(id))
      throw new Error("Odkazu na Facebook profil chybí ID.");
    u.search = "";
    u.searchParams.set("id", id);
  } else u.search = "";
  if (platform === "X") u.hostname = "x.com";
  if (platform === "Threads") u.hostname = "threads.com";
  if (platform === "Reddit") path = path.replace(/^\/u\//, "/user/");
  if (
    [
      "Instagram",
      "X",
      "Twitch",
      "Threads",
      "Kick",
      "Reddit",
      "Pinterest",
    ].includes(platform)
  )
    path = path.toLowerCase();
  u.pathname = path;
  return u.toString();
}

export type Connection = {
  verification_notice?: string | null;
  account_kind?: "profile" | "facebook_page";
  id: string;
  platform: string;
  social_url: string;
  label: string;
  status: "unverified" | "pending" | "verified";
  method: "bio" | "youtube_oauth" | "provider_oauth" | null;
  verified_at: string | null;
  social_bio?: string | null;
  avatar_url?: string | null;
  suggested_language?: string | null;
  suggested_country?: string | null;
  listing?: {
    id: string;
    slug: string;
    total_paid: number;
    promo_granted_at?: string | null;
    status: string;
    public: boolean;
  };
};

export function youtubeChannels(payload: unknown) {
  const parsed = z
    .object({
      items: z
        .array(
          z.object({
            id: z.string().regex(/^UC[\w-]{22}$/),
            snippet: z.object({
              title: z.string().min(1).max(200),
              description: z.string().max(5000).optional(),
              defaultLanguage: z.string().max(30).optional(),
              country: z.string().regex(/^[A-Z]{2}$/).optional(),
              thumbnails: z.object({ high:z.object({url:z.string().url()}).optional(), medium:z.object({url:z.string().url()}).optional(), default:z.object({url:z.string().url()}).optional() }).optional(),
            }),
          }),
        )
        .max(50),
    })
    .parse(payload);
  if (!parsed.items.length)
    throw new Error("U tohoto Google účtu jsme nenašli YouTube kanál.");
  return parsed.items.map((c) => ({
    remote_id: c.id,
    label: c.snippet.title,
    social_url: `https://youtube.com/channel/${c.id}`,
    social_bio: c.snippet.description || '',
    avatar_url: [c.snippet.thumbnails?.high?.url, c.snippet.thumbnails?.medium?.url, c.snippet.thumbnails?.default?.url].find(url => url && new URL(url).protocol === 'https:') || null,
    suggested_language: c.snippet.defaultLanguage?.split('-')[0].toLowerCase() || null,
    suggested_country: c.snippet.country || null,
  }));
}

export function authReturnPath(value: string | null) {
  return value === "/connections" || value === "/connections?add=1" || value === "/dashboard?tab=settings" ||
    (value && (/^\/p\/[a-z0-9-]{1,120}$/.test(value) ||
      /^\/join\?(?:profile|connection)=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
      /^\/join\?instagram=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)))
    ? value
    : "/dashboard";
}
