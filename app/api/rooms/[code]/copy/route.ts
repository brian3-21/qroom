import { store, StoreError } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { text, by } = await req.json().catch(() => ({}));
  const cleanCode = code.toUpperCase();
  const cleanText = typeof text === "string" ? text : "";
  const cleanBy = typeof by === "string" ? by : "";

  try {
    const ok = store.recordCopy(cleanCode, cleanText, cleanBy);
    if (!ok) {
      return Response.json(
        { error: "Sala no encontrada o expirada" },
        { status: 404 }
      );
    }
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof StoreError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
