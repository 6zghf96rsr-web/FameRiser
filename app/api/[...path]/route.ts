import { handle } from "@/lib/rankme/api";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(req: Request, { params }: Context) {
  return handle(req, (await params).path);
}
export async function POST(req: Request, { params }: Context) {
  return handle(req, (await params).path);
}
export async function PATCH(req: Request, { params }: Context) {
  return handle(req, (await params).path);
}
export async function DELETE(req: Request, { params }: Context) {
  return handle(req, (await params).path);
}
