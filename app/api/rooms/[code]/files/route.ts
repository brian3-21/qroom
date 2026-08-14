import { store, StoreError } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cleanCode = code.toUpperCase();
  const snapshot = store.snapshot(cleanCode);
  if (!snapshot) {
    return Response.json(
      { error: "Sala no encontrada o expirada" },
      { status: 404 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  }

  const uploadedBy = formData.get("uploadedBy");
  const uploaderName =
    typeof uploadedBy === "string" ? uploadedBy.trim() : "";

  try {
    const info = store.addFile(cleanCode, {
      name: file.name || "archivo",
      size: file.size,
      type: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
      uploadedBy: uploaderName || "Alguien",
    });
    if (!info) {
      return Response.json(
        { error: "Sala no encontrada o expirada" },
        { status: 404 }
      );
    }
    return Response.json(info);
  } catch (err) {
    if (err instanceof StoreError) {
      return Response.json({ error: err.message }, { status: 413 });
    }
    throw err;
  }
}