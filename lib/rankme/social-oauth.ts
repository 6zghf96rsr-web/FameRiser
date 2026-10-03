import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  adminDB,
  configured,
  demoEnabled,
  getUser,
} from "@/lib/supabase/server";
import { youtubeChannels } from "./connections";
import { z } from "zod";

const cookieName = "rankme-social-oauth";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function googleConfig() {
  const client = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const app = process.env.APP_URL;
  if (!client || !secret || !app || demoEnabled() || !configured())
    throw new Error("YouTube propojení zatím není aktivní.");
  return {
    client,
    secret,
    callback: new URL("/auth/social/callback", app).href,
  };
}

export async function startYouTube(userId: string) {
  const { client, callback } = googleConfig();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const db = adminDB();
  const cleanup = await db
    .from("social_oauth_states")
    .delete()
    .eq("user_id", userId);
  if (cleanup.error) throw new Error("Propojení nelze zahájit. Zkus to znovu.");
  const { error } = await db
    .from("social_oauth_states")
    .insert({ state_hash: hash(state), user_id: userId, verifier });
  if (error) throw new Error("Propojení nelze zahájit. Zkus to znovu.");
  (await cookies()).set(cookieName, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/social/callback",
    maxAge: 600,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: client,
    redirect_uri: callback,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    state,
    access_type: "online",
    prompt: "consent select_account",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}

export async function finishYouTube(req: Request) {
  const { client, secret, callback } = googleConfig();
  const url = new URL(req.url);
  const state = url.searchParams.get("state") || "";
  const jar = await cookies();
  const stored = jar.get(cookieName)?.value || "";
  jar.set(cookieName, "", {
    path: "/auth/social/callback",
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  if (
    !state ||
    state.length > 100 ||
    stored.length !== state.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(stored))
  )
    throw new Error("state");
  const user = await getUser();
  if (!user) throw new Error("session");
  const db = adminDB();
  const { data: verifier, error } = await db.rpc("consume_social_oauth", {
    p_hash: hash(state),
    p_user: user.id,
  });
  if (error || !verifier) throw new Error("state");
  if (url.searchParams.has("error")) return "cancelled";
  const code = url.searchParams.get("code");
  if (!code || code.length > 3000) throw new Error("code");
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client,
      client_secret: secret,
      redirect_uri: callback,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) throw new Error("token");
  const token = z
    .object({ access_token: z.string().min(1).max(5000) })
    .parse(await tokenResponse.json());
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50",
    {
      headers: { Authorization: `Bearer ${token.access_token}` },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    },
  );
  // Provider tokens stay in this request only. No profile URL from the browser is trusted.
  if (!response.ok) throw new Error("youtube");
  const payload = z
    .object({ items: z.array(z.unknown()) })
    .parse(await response.json());
  if (!payload.items.length) return "no-channel";
  const channels = youtubeChannels(payload);
  const result = await db.rpc("verify_youtube_connections", {
    p_user: user.id,
    p_channels: channels,
  });
  if (result.error) throw new Error("save");
  return "youtube";
}
