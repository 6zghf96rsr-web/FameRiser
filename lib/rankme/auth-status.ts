import { configured, demoEnabled, publicConfig } from "@/lib/supabase/server";
import { z } from "zod";
import { loginProviders, type LoginProvider } from "./login-providers";

export type AuthStatus = Record<LoginProvider, boolean> & {
  ready: boolean;
  youtube: boolean;
  facebookPages: boolean;
  unavailable: boolean;
};
export async function authStatus(): Promise<AuthStatus> {
  const ready = configured() && !demoEnabled();
  const result: AuthStatus = {
    ready,
    facebookPages: ready && Boolean(process.env.FACEBOOK_PAGES_APP_ID && process.env.FACEBOOK_PAGES_APP_SECRET && process.env.APP_URL),
    google: false,
    apple: false,
    facebook: false,
    twitch: false,
    x: false,
    youtube:
      ready &&
      Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    unavailable: false,
  };
  if (!ready) return result;
  try {
    const { url, key } = publicConfig();
    const r = await fetch(url + "/auth/v1/settings", {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error("settings");
    const data = z
      .object({
        external: z
          .object({
            google: z.boolean().optional(),
            apple: z.boolean().optional(),
            facebook: z.boolean().optional(),
            twitch: z.boolean().optional(),
            x: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(await r.json());
    for (const provider of loginProviders)
      result[provider] = data.external?.[provider] === true;
  } catch {
    result.unavailable = true;
  }
  return result;
}
