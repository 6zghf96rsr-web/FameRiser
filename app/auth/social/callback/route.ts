import { NextResponse } from "next/server";
import { finishYouTube } from "@/lib/rankme/social-oauth";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const destination = new URL(
    "/connections",
    process.env.APP_URL || new URL(req.url).origin,
  );
  try {
    destination.searchParams.set("result", await finishYouTube(req));
  } catch {
    destination.searchParams.set("result", "failed");
  }
  return NextResponse.redirect(destination, {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
