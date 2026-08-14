import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cleanCode = code.toUpperCase();
  const room = store.getRoom(cleanCode);
  if (!room) {
    return new Response("Sala no encontrada o expirada", { status: 404 });
  }

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const push = (data: unknown) => {
    if (controller && !closed) {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      } catch {
        closed = true;
      }
    }
  };

  const unsubscribe = store.subscribe(cleanCode, {
    onChange: () => {
      const snapshot = store.snapshot(cleanCode);
      if (snapshot) push(snapshot);
    },
    onDeleted: () => {
      push({ deleted: true });
      cleanup();
    },
  });

  const ping = setInterval(() => {
    if (!closed) {
      try {
        controller?.enqueue(encoder.encode(": ping\n\n"));
      } catch {
        cleanup();
      }
    }
  }, 15_000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    unsubscribe();
  };

  req.signal.addEventListener("abort", cleanup);

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      const snapshot = store.snapshot(cleanCode);
      if (snapshot) push(snapshot);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}