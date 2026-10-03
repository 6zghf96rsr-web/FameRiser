import { ZodError } from "zod";
import { demoAccountInput, DemoAccountError, type DemoIdentity } from "./demo-accounts";
import { demoAccountsSnapshot, ensureDemoOwner, limitDemoWrites, mutateDemoAccount } from "./demo-accounts-store";

const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie, oai-authenticated-user-id" },
});
async function smallJSON(req: Request) {
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new DemoAccountError(415, "Očekáváme JSON.");
  const reader = req.body?.getReader();
  if (!reader) throw new DemoAccountError(400, "Chybí údaje účtu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new DemoAccountError(413, "Požadavek je příliš velký."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new DemoAccountError(400, "Neplatné údaje účtu."); }
}

export async function handleDemoAccounts(req: Request, context: {
  demo: boolean; user: DemoIdentity | null; origin: string | undefined; database: () => D1Database;
}) {
  try {
    if (!context.demo) throw new DemoAccountError(404, "Správa testovacích účtů není dostupná.");
    if (!context.user) throw new DemoAccountError(401, "Nejdříve se přihlas do dema.");
    if (req.method !== "GET" && req.method !== "POST") throw new DemoAccountError(405, "Nepodporovaná metoda.");
    const user = context.user;
    const input = req.method === "POST" ? await (async () => {
      if (!context.origin) throw new DemoAccountError(503, "Ukládání není nakonfigurované.");
      if (req.headers.get("origin") !== new URL(context.origin).origin)
        throw new DemoAccountError(403, "Požadavek musí pocházet z tohoto webu.");
      return demoAccountInput.parse(await smallJSON(req));
    })() : null;
    const db = context.database();
    if (input) await limitDemoWrites(db, user.userId);
    await ensureDemoOwner(db, user);
    if (input) await mutateDemoAccount(db, user.userId, input);
    return reply(await demoAccountsSnapshot(db, user.userId));
  } catch (error) {
    if (error instanceof DemoAccountError) return reply({ error: error.message }, error.status);
    if (error instanceof ZodError) return reply({ error: "Zkontroluj jméno (2–80 znaků), roli a testovací e-mail s koncovkou .test." }, 400);
    if (error instanceof Error && /UNIQUE constraint failed: demo_users.owner_id, demo_users.email/.test(error.message))
      return reply({ error: "Tento e-mail už v tvém demu existuje." }, 409);
    console.error("Demo account storage failed", error instanceof Error ? error.name : "UnknownError");
    return reply({ error: "Databáze je dočasně nedostupná. Zkus to znovu; vyplněné údaje zůstanou ve formuláři." }, 503);
  }
}
