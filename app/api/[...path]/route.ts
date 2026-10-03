import { handle } from "@/lib/rankme/api";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const gone=()=>Response.json({error:'LEGACY_DISABLED'},{status:410,headers:{'Cache-Control':'no-store'}});
export async function GET(req: Request, { params }: Context) {
  if(process.env.CORE_V1_PRIVATE_ENABLED==='true')return gone();
  return handle(req, (await params).path);
}
export async function POST(req: Request, { params }: Context) {
  const path=(await params).path;
  if(process.env.CORE_V1_PRIVATE_ENABLED==='true'&&path.join('/')!=='notices')return gone();
  return handle(req,path);
}
export async function PATCH(req: Request, { params }: Context) {
  if(process.env.CORE_V1_PRIVATE_ENABLED==='true')return gone();
  return handle(req, (await params).path);
}
export async function DELETE(req: Request, { params }: Context) {
  if(process.env.CORE_V1_PRIVATE_ENABLED==='true')return gone();
  return handle(req, (await params).path);
}
