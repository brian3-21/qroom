import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const snapshot = store.snapshot(code.toUpperCase());
  if (!snapshot) {
    return Response.json(
      { error: "Sala no encontrada o expirada" },
      { status: 404 }
    );
  }
  return Response.json(snapshot);
}