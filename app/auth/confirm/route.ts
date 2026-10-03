import { NextResponse } from "next/server";
import { sessionDB } from "@/lib/supabase/server";
export async function GET(req: Request) {
  const url = new URL(req.url),
    origin = process.env.APP_URL || url.origin;
  const hash = url.searchParams.get("token_hash"),
    type = url.searchParams.get("type");
  const db = await sessionDB();
  if (hash && db && ["signup", "email", "recovery"].includes(type || "")) {
    const { error } = await db.auth.verifyOtp({
      token_hash: hash,
      type: type as "signup" | "email" | "recovery",
    });
    if (!error)
      return NextResponse.redirect(
        origin + (type === "recovery" ? "/login?reset=1" : "/account-consent"),
      );
  }
  if (url.searchParams.get("code"))
    return NextResponse.redirect(
      origin +
        "/auth/callback?code=" +
        encodeURIComponent(url.searchParams.get("code")!),
    );
  return NextResponse.redirect(origin + "/login?error=confirmation");
}
