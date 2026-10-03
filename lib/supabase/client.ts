"use client";
import { createBrowserClient } from "@supabase/ssr";
export function browserDB(config: { url: string; key: string }) {
  return config.url && config.key
    ? createBrowserClient(config.url, config.key)
    : null;
}
