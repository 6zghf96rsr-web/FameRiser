import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseConfig } from "./lib/supabase/runtime-config";
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = publicSupabaseConfig();
  if (url && key) {
    const db = createServerClient(
      url,
      key,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(items) {
            items.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            response = NextResponse.next({ request });
            items.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, {
                ...options,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
              }),
            );
          },
        },
      },
    );
    await db.auth.getUser();
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return response;
}
export const config = {
  matcher: [
    "/((?!api/stripe/webhook|_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
