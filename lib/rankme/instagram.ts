import { accountURL } from "./connections";

export type SavedInstagram = {
  id: string;
  username: string;
  social_url: string;
  created_at: number;
};

export function instagramURL(input: string) {
  let value = input.trim();
  if (/^@?[a-zA-Z0-9_.]{1,30}$/.test(value)) {
    value = `https://instagram.com/${value.replace(/^@/, "")}`;
  } else if (/^(www\.)?instagram\.com\//i.test(value)) {
    value = `https://${value}`;
  }
  const canonical = accountURL(value, "Instagram");
  const username = new URL(canonical).pathname.slice(1);
  if (username.startsWith(".") || username.endsWith(".") || username.includes("..")) {
    throw new Error("Zkontroluj uživatelské jméno na Instagramu.");
  }
  return { username, social_url: canonical };
}
