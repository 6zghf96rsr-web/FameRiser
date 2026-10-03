import { z } from "zod";
import { platforms, categories } from "./config";
import { countries, languages } from './discovery';
export const platformDomains: Record<string, string[]> = {
  Instagram: ["instagram.com"],
  TikTok: ["tiktok.com"],
  YouTube: ["youtube.com"],
  X: ["x.com", "twitter.com"],
  Facebook: ["facebook.com"],
  Twitch: ["twitch.tv"],
  LinkedIn: ["linkedin.com"],
  Threads: ["threads.net", "threads.com"],
  Snapchat: ["snapchat.com"],
  Pinterest: ["pinterest.com"],
  Kick: ["kick.com"],
  Reddit: ["reddit.com"],
};
export function safeSocialURL(
  raw: string,
  platform: string,
  blacklist: string[] = [],
  allowed: string[] = [],
) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Zadej platnou HTTPS adresu profilu.");
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    u.href.length > 500
  )
    throw new Error(
      "Povoleny jsou pouze bezpečné HTTPS odkazy bez přihlašovacích údajů.",
    );
  if (
    [
      "bit.ly",
      "tinyurl.com",
      "t.co",
      "goo.gl",
      "shorturl.at",
      ...blacklist,
    ].some((d) => host === d || host.endsWith("." + d))
  )
    throw new Error("Tato doména není povolena. Zadej přímý odkaz na profil.");
  const hosts = platformDomains[platform] || allowed;
  if (!hosts.includes(host))
    throw new Error(
      platform === "Jiná"
        ? "Tuto doménu musí nejdříve schválit administrátor."
        : "Odkaz neodpovídá vybrané sociální síti.",
    );
  if (
    u.pathname === "/" ||
    /(^|\/)(redirect|away|out|l\.php|share|intent|login|logout)(\/|$)/i.test(
      u.pathname,
    ) ||
    [...u.searchParams.keys()].some((k) =>
      /^(url|u|redirect|redirect_uri|next|target|continue)$/i.test(k),
    )
  )
    throw new Error("Zadej přímý odkaz na svůj profil bez přesměrování.");
  u.hash = "";
  u.hostname = host;
  return u.toString();
}
const clean = z
  .string()
  .trim()
  .refine(
    (s) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s),
    "HTML ani řídicí znaky nejsou povoleny.",
  );
export const profileInput = z
  .object({
    name: clean.pipe(z.string().min(2).max(60)),
    username: z
      .string()
      .trim()
      .regex(/^[\p{L}\p{N}._-]{2,50}$/u, "Neplatné uživatelské jméno."),
    bio: clean.pipe(z.string().max(1000)),
    language: z.string().refine(v => v === '' || languages.includes(v)).default(''),
    country: z.string().refine(v => v === '' || countries.includes(v)).default(''),
    region: clean.pipe(z.string().max(80)).default(''),
    platform: z.enum(platforms),
    category: z.enum(categories),
    social_url: z.string().max(500),
    avatar_url: z.string().max(1000).nullable().optional(),
    ownership: z.literal(true),
    non_political: z.literal(true),
    import_consent: z.boolean().default(false),
    privacy: z.literal(true),
  })
  .strict();
export const checkoutInput = z
  .object({
    profile_id: z.string().uuid(),
    target_total: z.number().int().min(100).max(100000000),
    accepted: z.literal(true),
    request_id: z.string().uuid(),
  })
  .strict();
export const reportInput = z
  .object({
    profile_id: z.string().uuid(),
    reason: z.enum([
      "fake",
      "impersonation",
      "illegal",
      "adult",
      "spam",
      "scam",
      "other",
    ]),
    details: clean.pipe(z.string().max(1000)).default(""),
  })
  .strict();
