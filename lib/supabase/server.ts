import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicSupabaseConfig } from "./runtime-config";
export const configured = () =>
  Boolean(
    publicSupabaseConfig().url &&
    publicSupabaseConfig().key &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
export const demoEnabled = () => process.env.RANKME_DEMO === "true";
export function adminDB() {
  if (!configured()) throw new Error("Databáze zatím není připojená.");
  return createClient(
    publicSupabaseConfig().url,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function sessionDB() {
  const jar = await cookies();
  if (!configured()) return null;
  return createServerClient(
    publicSupabaseConfig().url,
    publicSupabaseConfig().key,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) =>
              jar.set(name, value, {
                ...options,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/",
              }),
            );
          } catch {
            /* Server Components cannot set cookies; middleware refreshes them. */
          }
        },
      },
    },
  );
}
export async function getUser() {
  const db = await sessionDB();
  if (!db) return null;
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  return error ? null : user;
}
export function publicConfig() {
  return publicSupabaseConfig();
}
