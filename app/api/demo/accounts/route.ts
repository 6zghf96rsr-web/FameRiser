import { getChatGPTUser } from "@/app/chatgpt-auth";
import { rankmeDB } from "@/db";
import { handleDemoAccounts } from "@/lib/rankme/demo-accounts-api";

export const dynamic = "force-dynamic";
async function handle(req: Request) {
  const demo = process.env.RANKME_DEMO === "true";
  return handleDemoAccounts(req, {
    demo,
    user: demo ? await getChatGPTUser() : null,
    origin: process.env.APP_URL,
    database: rankmeDB,
  });
}
export const GET = handle;
export const POST = handle;
