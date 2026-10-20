"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import type { RoomSnapshot } from "@/lib/store";
import {
  clearPid,
  getClientId,
  getPid,
  getStoredName,
  setPid,
  setStoredName,
} from "@/lib/client";
import { formatBytes, formatRelative } from "@/lib/format";
import ThemeToggle from "@/components/ThemeToggle";

type Status = "loading" | "notfound" | "ok";

const SYNC_DEBOUNCE_MS = 500;

const labelClass =
  "font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-faint";
const inputClass =
  "w-full border-2 border-fg bg-background px-3 py-3 font-mono text-sm text-fg placeholder-faint outline-none transition focus:border-accent focus:bg-accent-soft/40";
const btnPrimaryClass =
  "border-2 border-fg bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-on-accent shadow-[3px_3px_0_0_var(--q-fg)] transition hover:bg-accent-strong active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-40 sm:text-sm";
const btnMonoClass =
  "font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted underline-offset-4 transition hover:text-accent hover:underline";
const summaryClass =
  "group flex cursor-pointer select-none items-center gap-2.5 px-4 py-3.5 list-none [&::-webkit-details-marker]:hidden";

export default function SalaClient({ code }: { code: string }) {
  const router = useRouter();
  const cleanCode = code.toUpperCase();
  const [status, setStatus] = useState<Status>("loading");
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [joined, setJoined] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [expiresIn, setExpiresIn] = useState("");
  const [copied, setCopied] = useState<"" | "text" | "code" | "link">("");
  const [myName, setMyName] = useState("");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const joinedRef = useRef(false);
  const uploadingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef("");
  const focusedRef = useRef(false);
  const lastRemoteRef = useRef(0);
  const pendingRemoteRef = useRef<string | null>(null);
  const lastSentRef = useRef("");
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleanCode, name: nameInput, clientId: getClientId() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo entrar a la sala");
      setPid(cleanCode, data.participant.id);
      setStoredName(cleanCode, nameInput);
      setMyName(nameInput);
      joinedRef.current = true;
      setJoined(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    }
  };

  const applySnapshot = useCallback((snapshot: RoomSnapshot) => {
    setRoom(snapshot);

    if (snapshot.updatedAt > lastRemoteRef.current) {
      lastRemoteRef.current = snapshot.updatedAt;
      const same = snapshot.text === draftRef.current;
      if (!same && focusedRef.current) {
        pendingRemoteRef.current = snapshot.text;
      } else if (!same) {
        draftRef.current = snapshot.text;
        setDraft(snapshot.text);
      }
    }

    const pid = getPid(snapshot.code);
    const isJoined = Boolean(pid && snapshot.participants.some((p) => p.id === pid));
    joinedRef.current = isJoined;
    setJoined(isJoined);
    if (isJoined) setMyName(snapshot.participants.find((p) => p.id === pid)?.name ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${cleanCode}`);
        if (!res.ok) throw new Error("notfound");
        const snapshot: RoomSnapshot = await res.json();
        if (!active) return;
        lastRemoteRef.current = snapshot.updatedAt;
        draftRef.current = snapshot.text;
        setDraft(snapshot.text);
        applySnapshot(snapshot);
        setStatus("ok");
        const pid = getPid(cleanCode);
        if (pid) setNameInput(getStoredName(cleanCode));
      } catch {
        if (active) setStatus("notfound");
      }
    })();
    return () => {
      active = false;
    };
  }, [cleanCode, applySnapshot]);

  useEffect(() => {
    if (status !== "ok") return;
    const es = new EventSource(`/api/rooms/${cleanCode}/stream`);
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as RoomSnapshot & { deleted?: boolean };
      if (data.deleted) {
        es.close();
        setStatus("notfound");
        return;
      }
      applySnapshot(data);
    };
    return () => es.close();
  }, [status, cleanCode, applySnapshot]);

  useEffect(() => {
    if (!room) return;
    const tick = () => {
      const remaining = room.expiresAt - Date.now();
      if (remaining <= 0) {
        setStatus("notfound");
        return;
      }
      const h = Math.floor(remaining / 3_600_000);
      const m = Math.floor((remaining % 3_600_000) / 60_000);
      const s = Math.floor((remaining % 60_000) / 1000);
      setExpiresIn(`${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [room]);

  useEffect(() => {
    const onHide = () => {
      if (!joinedRef.current) return;
      const body = JSON.stringify({ code: cleanCode, clientId: getClientId() });
      navigator.sendBeacon(
        `/api/rooms/leave`,
        new Blob([body], { type: "application/json" })
      );
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [cleanCode]);

  const sendText = useCallback(
    async (text: string) => {
      if (text === lastSentRef.current) return;
      lastSentRef.current = text;
      setPending(false);
      try {
        await fetch(`/api/rooms/${cleanCode}/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, by: myName }),
        });
      } catch {
        lastSentRef.current = "";
        setError("No se pudo sincronizar el texto, reintentando...");
      }
    },
    [cleanCode, myName]
  );

  const syncNow = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (draftRef.current !== lastSentRef.current) void sendText(draftRef.current);
  }, [sendText]);

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    draftRef.current = value;
    setDraft(value);
    setPending(true);
    if (value === lastSentRef.current) {
      setPending(false);
      return;
    }
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      void sendText(draftRef.current);
    }, SYNC_DEBOUNCE_MS);
  };

  const onTextPaste = () => {
    syncNow();
  };

  const onTextFocus = () => {
    focusedRef.current = true;
  };

  const onTextBlur = () => {
    focusedRef.current = false;
    if (pendingRemoteRef.current !== null) {
      draftRef.current = pendingRemoteRef.current;
      setDraft(pendingRemoteRef.current);
      pendingRemoteRef.current = null;
    }
    syncNow();
  };

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fallback (iOS Safari)
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }

  const recordCopiedText = useCallback(
    (text: string) => {
      // Best-effort: guarda en el historial la copia real, sin bloquear la UX.
      fetch(`/api/rooms/${cleanCode}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, by: myName }),
      }).catch(() => {});
    },
    [cleanCode, myName]
  );

  const copy = async (
    kind: "" | "text" | "code" | "link",
    text: string,
    record = false
  ) => {
    if (!text) return;
    try {
      await copyText(text);
      if (kind === "text" && record) recordCopiedText(text);
      setCopied(kind);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setError("No se pudo copiar");
    }
  };

  const uploadFile = (file: File) => {
    if (uploadingRef.current) return;
    if (!room) return;
    if (file.size > room.limits.maxFileBytes) {
      setError("Cada archivo debe pesar menos de 5 MB");
      return;
    }
    setError("");
    uploadingRef.current = true;
    setUploading({ name: file.name, progress: 0 });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("uploadedBy", myName);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/rooms/${cleanCode}/files`);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      setUploading({ name: file.name, progress: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.onload = () => {
      uploadingRef.current = false;
      setUploading(null);
      if (xhr.status >= 400) {
        try {
          const data = JSON.parse(xhr.responseText) as { error?: string };
          setError(data.error ?? "No se pudo subir el archivo");
        } catch {
          setError("No se pudo subir el archivo");
        }
      }
    };
    xhr.onerror = () => {
      uploadingRef.current = false;
      setUploading(null);
      setError("Error de red al subir el archivo");
    };
    xhr.send(formData);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) uploadFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer.files)) uploadFile(file);
  };

  const leave = async () => {
    await fetch(`/api/rooms/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: cleanCode, clientId: getClientId() }),
    });
    clearPid(cleanCode);
    router.push("/");
  };

  const deleteFile = async (fileId: string) => {
    const res = await fetch(`/api/rooms/${cleanCode}/files/${fileId}`, {
      method: "DELETE",
    });
    if (!res.ok) setError("No se pudo borrar el archivo");
  };

  if (status === "loading") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-background">
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-muted">
          <span aria-hidden className="text-accent">
            &gt;
          </span>{" "}
          cargando sala
          <span className="q-blink">_</span>
        </p>
      </main>
    );
  }

  if (status === "notfound") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6">
        <p className="font-mono text-6xl font-bold tracking-tight">404</p>
        <div className="text-center">
          <h1 className="font-mono text-lg font-bold uppercase tracking-[0.15em]">
            sala no encontrada o expirada
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.15em] text-muted">
            las salas duran 24 h desde su creación
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className={btnPrimaryClass}
        >
          [ crear o unirse a otra sala ]
        </button>
      </main>
    );
  }

  const roomUrl =
    typeof window !== "undefined" ? window.location.href : `/${cleanCode}`;
  const pid = getPid(cleanCode);
  // Entrada "en vivo": el texto compartido actual pisa el historial mientras
  // no se haya copiado (una vez copiado, la copia es la 1ª entrada y esta se oculta).
  const liveEntry =
    room && room.text && room.text !== room.history[room.history.length - 1]?.text
      ? {
          id: "live",
          text: room.text,
          by: room.textBy || "Alguien",
          at: room.updatedAt,
          live: true as const,
        }
      : null;

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const shareRoom = async () => {
    try {
      await navigator.share({
        title: `Sala ${cleanCode} · Qroom`,
        text: `Únete a mi sala ${cleanCode} en Qroom`,
        url: roomUrl,
      });
    } catch {
      // El usuario canceló el compartir nativo, no es un error.
    }
  };

  return (
    <main className="q-fade flex flex-1 flex-col bg-background">
      <header className="sticky top-0 z-40 border-b-2 border-fg bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
          <button
            onClick={() => router.push("/")}
            title="Volver al inicio"
            className="shrink-0 font-mono text-base font-bold tracking-tight"
          >
            QROOM<span className="text-accent">~$</span>
          </button>

          <div className="ml-1 flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
            <span className="border-2 border-fg bg-card px-2.5 py-1.5 font-mono text-xs font-bold tracking-[0.25em] sm:text-sm">
              {cleanCode}
            </span>
            <button
              onClick={() => copy("code", cleanCode)}
              className={`${btnMonoClass} shrink-0 ${
                copied === "code" ? "text-ok" : ""
              }`}
            >
              {copied === "code" ? "copiado ✓" : "[ copiar ]"}
            </button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <ThemeToggle />
            {joined && (
              <button
                onClick={leave}
                className={`${btnMonoClass} shrink-0 hover:text-danger`}
              >
                [ salir ]
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 pt-5 pb-48 sm:px-6 sm:pb-52">
        {!joined && room && (
          <section className="mx-auto w-full max-w-3xl border-2 border-fg bg-card p-5 sm:p-7">
            <div className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="flex flex-col items-center gap-2.5">
                <div className="border-2 border-fg bg-white p-2.5">
                  <QRCode
                    value={roomUrl}
                    size={168}
                    bgColor="#ffffff"
                    fgColor="#16150f"
                  />
                </div>
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-faint">
                  ▸ escanea para unirte
                </p>
              </div>

              <form onSubmit={join} className="flex flex-col gap-4">
                <div>
                  <h2 className="font-mono text-base font-bold uppercase tracking-[0.15em]">
                    <span aria-hidden className="text-accent">
                      &gt;
                    </span>{" "}
                    unirse
                  </h2>
                  <p className="mt-1.5 font-mono text-xs uppercase tracking-[0.25em] text-faint">
                    sala: {cleanCode} · sin cuentas, sin esperas
                  </p>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className={labelClass}>nombre</span>
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="ana"
                    maxLength={40}
                    required
                    autoComplete="nickname"
                    className={inputClass}
                  />
                </label>
                <button type="submit" className={btnPrimaryClass}>
                  [ entrar a la sala ]
                </button>
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
                  expira: {expiresIn} · en línea: {room.participants.length}
                </p>
              </form>
            </div>
          </section>
        )}

        {error && (
          <div
            role="alert"
            className="border-2 border-danger bg-danger/10 px-3 py-2.5 font-mono text-xs leading-5 text-danger"
          >
            [!] {error}
          </div>
        )}

        {room && joined && (
          <>
            <section className="flex flex-1 flex-col gap-2.5">
              <div className="flex items-center gap-2 px-1 font-mono text-[10px] font-bold uppercase tracking-[0.15em] sm:text-xs">
                {pending ? (
                  <span className="text-accent">
                    &gt; enviando…
                  </span>
                ) : draft === "" ? (
                  <span className="text-faint">idle · pega un texto para compartir</span>
                ) : copied === "text" ? (
                  <span className="text-ok">● en tu portapapeles</span>
                ) : (
                  <span className="text-ok">● listo para copiar</span>
                )}
                <span className="ml-auto shrink-0 tracking-[0.1em] text-faint">
                  car. {draft.length}
                </span>
              </div>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={onTextChange}
                onPaste={onTextPaste}
                onFocus={onTextFocus}
                onBlur={onTextBlur}
                onClick={(e) => {
                  if (window.matchMedia("(pointer: fine)").matches) {
                    e.currentTarget.select();
                  }
                }}
                placeholder="pega aquí un texto… se sincroniza al instante en todos los dispositivos"
                aria-label="Texto de la sala"
                className="min-h-[42dvh] w-full flex-1 resize-y border-2 border-fg bg-card p-4 font-mono text-sm leading-7 placeholder-faint outline-none transition focus:border-accent focus:bg-accent-soft/20 selection:bg-accent/30 sm:p-5 sm:text-base"
                spellCheck={false}
              />
            </section>

            <details className="group border-2 border-fg bg-card">
              <summary className={summaryClass}>
                <span
                  aria-hidden
                  className="inline-block text-[10px] text-accent transition-transform duration-200 group-open:rotate-90"
                >
                  ▸
                </span>
                <span className="font-mono text-xs font-bold uppercase tracking-[0.2em]">
                  historial
                </span>
                <span className="ml-auto font-mono text-[10px] tracking-[0.2em] text-faint">
                  [{(room.history ?? []).length + (liveEntry ? 1 : 0)}]
                </span>
              </summary>
              <div className="flex flex-col gap-2 border-t-2 border-fg px-4 py-4">
                {!liveEntry && room.history.length === 0 && (
                  <p className="font-mono text-xs leading-5 text-muted sm:text-sm">
                    aún no hay nada en el historial. el texto que escribas aquí
                    que quieras conservar, cópialo desde cualquier dispositivo.
                  </p>
                )}
                <ul className="flex flex-col gap-2">
                  {liveEntry && (
                    <li className="flex flex-col gap-2 border-2 border-dashed border-accent bg-accent-soft/40 px-3 py-3">
                      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                        <span className="font-bold text-accent">
                          [{liveEntry.by.slice(0, 2).toUpperCase()}]
                        </span>
                        <span className="truncate font-semibold normal-case">
                          {liveEntry.by}
                        </span>
                        <span className="flex items-center gap-1.5 normal-case text-accent">
                          <span className="q-blink">●</span>escribiendo…
                        </span>
                        <span className="ml-auto shrink-0 normal-case text-faint">
                          {formatRelative(liveEntry.at)}
                        </span>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-xs leading-6 sm:text-sm">
                        {liveEntry.text}
                      </p>
                      <button
                        onClick={() => copy("text", liveEntry.text, true)}
                        className={`${btnMonoClass} self-end`}
                      >
                        [ copiar ]
                      </button>
                    </li>
                  )}
                  {room.history
                    .slice()
                    .reverse()
                    .map((h) => (
                      <li
                        key={h.id}
                        className="flex flex-col gap-2 border border-fg/20 bg-background px-3 py-3"
                      >
                        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                          <span className="font-bold text-accent">
                            [{h.by.slice(0, 2).toUpperCase()}]
                          </span>
                          <span className="truncate font-semibold normal-case">
                            {h.by}
                          </span>
                          <span className="ml-auto shrink-0 normal-case text-faint">
                            {formatRelative(h.at)}
                          </span>
                        </div>
                        <p className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-xs leading-6 sm:text-sm">
                          {h.text}
                        </p>
                        <button
                          onClick={() => copy("text", h.text)}
                          className={`${btnMonoClass} self-end`}
                        >
                          [ copiar ]
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </details>

            <div className="flex flex-col gap-2.5">
              <details className="group border-2 border-fg bg-card">
                <summary className={summaryClass}>
                  <span
                    aria-hidden
                    className="inline-block text-[10px] text-accent transition-transform duration-200 group-open:rotate-90"
                  >
                    ▸
                  </span>
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.2em]">
                    personas conectadas
                  </span>
                  <span className="ml-auto font-mono text-[10px] tracking-[0.2em] text-faint">
                    [{room.participants.length}]
                  </span>
                </summary>
                <div className="border-t-2 border-fg px-4 py-4">
                  {room.participants.length === 0 && (
                    <p className="font-mono text-xs text-muted sm:text-sm">
                      nadie conectado aún.
                    </p>
                  )}
                  <ul className="flex flex-col gap-1.5">
                    {room.participants.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-2 border border-fg/20 bg-background px-3 py-2.5 font-mono text-xs sm:text-sm"
                      >
                        <span className="font-bold text-accent">
                          [{p.name.slice(0, 2).toUpperCase()}]
                        </span>
                        <span className="truncate font-semibold">
                          {p.name}
                          {p.id === pid && (
                            <span className="ml-1.5 text-accent">(tú)</span>
                          )}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-1.5">
                          <span className="text-[8px] leading-none text-ok">
                            <span className="q-blink">●</span>
                          </span>
                          <span className="text-[9px] uppercase tracking-[0.15em] text-faint">
                            en línea
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>

              <details className="group border-2 border-fg bg-card">
                <summary className={summaryClass}>
                  <span
                    aria-hidden
                    className="inline-block text-[10px] text-accent transition-transform duration-200 group-open:rotate-90"
                  >
                    ▸
                  </span>
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.2em]">
                    compartir sala
                  </span>
                </summary>
                <div className="flex flex-col items-center gap-4 border-t-2 border-fg px-4 py-4">
                  <div className="border-2 border-fg bg-white p-2">
                    <QRCode
                      value={roomUrl}
                      size={120}
                      bgColor="#ffffff"
                      fgColor="#16150f"
                    />
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => copy("link", roomUrl)}
                      className={`${btnMonoClass} h-11 flex-1 border-2 border-fg bg-background no-underline hover:border-accent`}
                    >
                      {copied === "link" ? "enlace copiado ✓" : "[ copiar enlace ]"}
                    </button>
                    {canShare && (
                      <button
                        onClick={shareRoom}
                        className="h-11 flex-1 border-2 border-fg bg-accent font-mono text-xs font-bold uppercase tracking-[0.2em] text-on-accent shadow-[3px_3px_0_0_var(--q-fg)] transition hover:bg-accent-strong active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                      >
                        [ compartir… ]
                      </button>
                    )}
                  </div>
                </div>
              </details>

              <details className="group border-2 border-fg bg-card">
                <summary className={summaryClass}>
                  <span
                    aria-hidden
                    className="inline-block text-[10px] text-accent transition-transform duration-200 group-open:rotate-90"
                  >
                    ▸
                  </span>
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.2em]">
                    archivos
                  </span>
                  <span className="ml-auto font-mono text-[10px] tracking-[0.2em] text-faint">
                    [{room.files.length}]
                  </span>
                </summary>
                <div className="flex flex-col gap-3 border-t-2 border-fg px-4 py-4">
                  <div
                    onDrop={onDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex flex-col items-center gap-3 border-2 border-dashed border-fg/40 px-4 py-8 text-center transition hover:border-accent"
                  >
                    <span aria-hidden className="font-mono text-2xl leading-none text-accent">
                      +
                    </span>
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] sm:text-sm">
                      arrastra archivos aquí
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
                      o selecciónalos desde tu dispositivo · máx. 5 MB por archivo
                    </p>
                    <label
                      className={`${btnPrimaryClass} cursor-pointer px-4 py-2.5`}
                    >
                      [ elegir archivos ]
                      <input
                        type="file"
                        multiple
                        onChange={onInputChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {uploading && (
                    <div className="border border-fg/20 bg-background p-3">
                      <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.15em]">
                        <span className="truncate text-accent">
                          &gt; subiendo {uploading.name}
                        </span>
                        <span className="shrink-0 text-faint">
                          {uploading.progress}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-fg/10">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${uploading.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {room.files.length === 0 && (
                    <p className="font-mono text-xs text-muted sm:text-sm">
                      aún no hay archivos en la sala.
                    </p>
                  )}
                  <ul className="flex flex-col gap-1.5">
                    {room.files.map((f) => {
                      const ext = (
                        f.name.includes(".")
                          ? (f.name.split(".").pop() ?? "file")
                          : "file"
                      ).toUpperCase();
                      return (
                        <li
                          key={f.id}
                          className="flex flex-col gap-2 border border-fg/20 bg-background px-3 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <span className="shrink-0 font-mono text-[10px] font-bold text-accent">
                              [.{ext.slice(0, 4)}]
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-mono text-xs font-semibold sm:text-sm">
                                {f.name}
                              </p>
                              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
                                {formatBytes(f.size)} · {f.uploadedBy}
                              </p>
                            </div>
                            <a
                              href={`/api/rooms/${cleanCode}/files/${f.id}`}
                              className="shrink-0 border-2 border-fg bg-fg px-2.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-background transition hover:opacity-85"
                            >
                              descargar
                            </a>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() =>
                                copy(
                                  "link",
                                  `${window.location.origin}/api/rooms/${cleanCode}/files/${f.id}`
                                )
                              }
                              className={btnMonoClass}
                            >
                              [ copiar enlace ]
                            </button>
                            <button
                              onClick={() => deleteFile(f.id)}
                              className={`${btnMonoClass} ml-auto hover:text-danger`}
                            >
                              [ borrar ]
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>

              <p className="px-2 font-mono text-[9px] uppercase tracking-[0.15em] text-faint sm:text-[10px]">
                texto 64 kb · archivo {formatBytes(room.limits.maxFileBytes)} ·
                sala {formatBytes(room.limits.maxRoomBytes)} · expira en{" "}
                {expiresIn}
              </p>
            </div>
          </>
        )}
      </div>

      {room && joined && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-fg bg-card/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.15em] sm:text-[11px]">
                {draft === ""
                  ? "idle — pega un texto"
                  : pending
                    ? <span className="text-accent">{"→ enviando…"}</span>
                    : copied === "text"
                      ? <span className="text-ok">{"● en tu portapapeles"}</span>
                      : <span className="text-ok">{"● listo para copiar"}</span>}
              </p>
              <p className="hidden truncate font-mono text-[9px] uppercase tracking-[0.15em] text-faint sm:block">
                {draft === ""
                  ? "se sincroniza solo"
                  : pending
                    ? "…"
                    : room.textBy
                      ? `actualizado por ${room.textBy}`
                      : "sincronizado"}
              </p>
            </div>
            <button
              onClick={() => copy("text", draft, true)}
              disabled={draft === ""}
              className="shrink-0 border-2 border-fg bg-accent px-6 py-3.5 font-mono text-xs font-bold uppercase tracking-[0.2em] text-on-accent shadow-[3px_3px_0_0_var(--q-fg)] transition hover:bg-accent-strong active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-40 sm:px-10 sm:text-sm"
            >
              {copied === "text" ? "copiado ✓" : "[ copiar ]"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}