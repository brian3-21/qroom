import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { code, clientId } = await req.json().catch(() => ({}));
  const cleanCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  const cleanId = typeof clientId === "string" ? clientId.trim() : "";

  if (!cleanCode || !cleanId) return Response.json({ ok: false }, { status: 400 });

  store.leaveRoom(cleanCode, cleanId);
  return Response.json({ ok: true });
}