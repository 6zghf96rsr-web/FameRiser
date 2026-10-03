import { z, ZodError } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { instagramDB } from "@/db";
import { addInstagram, InstagramError, listInstagram, removeInstagram } from "@/lib/rankme/instagram-store";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie, oai-authenticated-user-id" },
});
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), account: z.string().trim().min(1).max(500), ownership: z.literal(true) }).strict(),
  z.object({ action: z.literal("remove"), id: z.string().uuid() }).strict(),
]);

async function smallJSON(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new InstagramError(415, "Očekáváme JSON.");
  const reader = req.body?.getReader();
  if (!reader) throw new InstagramError(400, "Chybí údaje účtu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) { await reader.cancel(); throw new InstagramError(413, "Požadavek je příliš velký."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new InstagramError(400, "Neplatné údaje účtu."); }
}

async function handle(req: Request, write: boolean) {
  try {
    const user = await getChatGPTUser();
    if (!user) throw new InstagramError(401, "Pro uložení účtu se přihlas přes ChatGPT.");
    if (write) {
      const expected = process.env.APP_URL;
      if (!expected) throw new InstagramError(503, "Ukládání není nakonfigurované.");
      if (req.headers.get("origin") !== new URL(expected).origin) throw new InstagramError(403, "Požadavek musí pocházet z tohoto webu.");
      const data = input.parse(await smallJSON(req));
      if (data.action === "add") {
        const account = await addInstagram(instagramDB(), user.userId, data.account);
        return reply({ account });
      }
      await removeInstagram(instagramDB(), user.userId, data.id);
      return reply({ ok: true });
    }
    return reply({ accounts: await listInstagram(instagramDB(), user.userId) });
  } catch (error) {
    if (error instanceof InstagramError) return reply({ error: error.message }, error.status);
    if (error instanceof ZodError) return reply({ error: "Zkontroluj údaje a potvrď, že účet smíš spravovat." }, 400);
    console.error("Instagram storage request failed", error instanceof Error ? error.name : "UnknownError");
    return reply({ error: "Ukládání Instagramu je dočasně nedostupné. Zkus to znovu; vyplněné údaje zůstanou ve formuláři." }, 503);
  }
}
export function GET(req: Request) { return handle(req, false); }
export function POST(req: Request) { return handle(req, true); }
