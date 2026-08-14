import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { code, name, clientId } = await req.json().catch(() => ({}));
  const cleanCode = typeof code === "string" ? code.trim().toUpperCase() : "";
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

  const result = store.joinRoom(cleanCode, cleanName, cleanId);
  if (!result) {
    return Response.json(
      { error: "Sala no encontrada o expirada" },
      { status: 404 }
    );
  }

  return Response.json({ participant: result.participant });
}