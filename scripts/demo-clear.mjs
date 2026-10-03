import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
try {
  process.loadEnvFile(".env");
} catch {}
if (
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const { error } = await db.from("profiles").delete().eq("demo", true);
  if (error) throw error;
}
const env = await readFile(".env", "utf8").catch(() => "");
await writeFile(
  ".env",
  env.includes("RANKME_DEMO=")
    ? env.replace(/^RANKME_DEMO=.*$/m, "RANKME_DEMO=false")
    : env + "\nRANKME_DEMO=false\n",
);
console.log(
  "Demo profiles removed; local demo mode disabled. For hosted deployments also set RANKME_DEMO=false in runtime environment.",
);
