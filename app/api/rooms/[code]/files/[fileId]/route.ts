import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string; fileId: string }> }
) {
  const { code, fileId } = await params;
  const file = store.getFile(code.toUpperCase(), fileId);
  if (!file) {
    return new Response("Archivo no encontrado", { status: 404 });
  }

  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ code: string; fileId: string }> }
) {
  const { code, fileId } = await params;
  const removed = store.removeFile(code.toUpperCase(), fileId);
  if (!removed) {
    return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
  }
  return Response.json({ ok: true });
}