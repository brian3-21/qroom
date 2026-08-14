import { store, StoreError } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { name, clientId } = await req.json().catch(() => ({}));
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanId = typeof clientId === "string" ? clientId.trim() : "";

  if (!cleanName) {
    return Response.json({ error: "Escribe tu nombre para entrar a la sala" }, { status: 400 });
  }
  if (cleanName.length > 40) {
    return Response.json({ error: "El nombre no puede superar los 40 caracteres" }, { status: 400 });
  }
  if (!cleanId) {
    return Response.json({ error: "Falta el identificador del cliente" }, { status: 400 });
  }

  try {
    const { room, participant } = store.createRoom(cleanName, cleanId);
    return Response.json({ code: room.code, participant });
  } catch (err) {
    if (err instanceof StoreError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}