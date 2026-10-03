import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseConfig } from "./lib/supabase/runtime-config";
export async function middleware(request: NextRequest) {
  if(process.env.CORE_V1_PRIVATE_ENABLED!=='true'&&request.nextUrl.pathname==='/api/stripe/webhook')
    return NextResponse.next({request});
  if(process.env.CORE_V1_PRIVATE_ENABLED==='true'){
    const path=request.nextUrl.pathname;
    if(path.startsWith('/api/')&&path!=='/api/private/core')
      return new NextResponse(JSON.stringify({error:'LEGACY_DISABLED'}),
        {status:410,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    if(!path.startsWith('/private')&&path!=='/api/private/core'&&path!=='/auth/private-confirm'&&
      path!=='/auth/social/callback'&&path!=='/robots.txt'&&path!=='/sitemap.xml'){
      return NextResponse.redirect(new URL(path==='/login'?'/private/login':'/private',request.url));
    }
  }
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
    "/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|ico|png|jpg|jpeg|webp|woff|woff2|ttf|otf)$).*)",
  ],
};
