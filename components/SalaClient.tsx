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

type Status = "loading" | "notfound" | "ok";

const SYNC_DEBOUNCE_MS = 500;

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
      <main className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="animate-pulse text-zinc-500 dark:text-zinc-400">Cargando sala...</p>
      </main>
    );
  }

  if (status === "notfound") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-6 dark:bg-black">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Sala no encontrada o expirada
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Las salas duran 24 horas desde su creación.
        </p>
        <button
          onClick={() => router.push("/")}
          className="rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-cyan-400"
        >
          Crear o unirse a otra sala
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
  const inputClass =
    "w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-400";

  return (
    <main className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <button
            onClick={() => router.push("/")}
            className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Qroom
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copy("code", cleanCode)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm font-semibold tracking-[0.2em] text-zinc-900 transition hover:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {cleanCode}
            </button>
            {copied === "code" && (
              <span className="text-xs font-medium text-cyan-500">¡Copiado!</span>
            )}
          </div>
          {joined && (
            <button
              onClick={leave}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 transition hover:border-red-400 hover:text-red-500 dark:border-zinc-700 dark:text-zinc-300"
            >
              Salir
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 pb-32 sm:px-6">
        {!joined && room && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-8">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200 dark:ring-zinc-700">
                  <QRCode value={roomUrl} size={140} />
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Escanea para unirte desde otro dispositivo
                </p>
              </div>
              <form onSubmit={join} className="flex w-full flex-1 flex-col gap-3">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Unirte a la sala {cleanCode}
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Solo necesitas un nombre. Sin cuentas, sin esperas.
                </p>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Tu nombre"
                  maxLength={40}
                  required
                  className={inputClass}
                />
                <button
                  type="submit"
                  className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-cyan-400"
                >
                  Entrar a la sala
                </button>
              </form>
            </div>
          </section>
        )}

        {error && (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        {room && joined && (
          <>
            <section className="flex flex-1 flex-col">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={onTextChange}
                onPaste={onTextPaste}
                onFocus={onTextFocus}
                onBlur={onTextBlur}
                onClick={(e) => e.currentTarget.select()}
                placeholder="Pega aquí un texto... se sincroniza al instante en todos los dispositivos."
                className="min-h-[45vh] flex-1 resize-y rounded-2xl border border-zinc-200 bg-white p-5 text-lg leading-7 text-zinc-900 placeholder-zinc-400 shadow-sm outline-none transition focus:border-cyan-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder-zinc-600"
                spellCheck={false}
              />
            </section>

            <details className="group rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
              <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-600 transition hover:text-cyan-500 dark:text-zinc-300">
                Historial ({(room.history ?? []).length + (liveEntry ? 1 : 0)})
                <span className="text-xs text-zinc-400 transition group-open:rotate-180">▾</span>
              </summary>
              <div className="flex flex-col gap-2 px-4 pb-4">
                {!liveEntry && room.history.length === 0 && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Aún no hay nada en el historial. El texto que escribas aquí
                    que quieras conservar, cópialo desde cualquier dispositivo.
                  </p>
                )}
                <ul className="flex flex-col gap-2">
                  {liveEntry && (
                    <li
                      key={liveEntry.id}
                      className="flex flex-col gap-2 rounded-xl border border-dashed border-cyan-500/40 bg-cyan-500/5 px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-500">
                          {liveEntry.by.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                          {liveEntry.by}
                        </span>
                        <span className="flex items-center gap-1.5 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
                          escribiendo…
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                          {formatRelative(liveEntry.at)}
                        </span>
                      </div>
                      <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-5 text-zinc-700 dark:text-zinc-200">
                        {liveEntry.text}
                      </p>
                      <button
                        onClick={() => copy("text", liveEntry.text, true)}
                        className="self-end text-xs font-medium text-zinc-500 transition hover:text-cyan-500 dark:text-zinc-400"
                      >
                        Copiar
                      </button>
                    </li>
                  )}
                  {room.history
                    .slice()
                    .reverse()
                    .map((h) => (
                      <li
                        key={h.id}
                        className="flex flex-col gap-2 rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800/60"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-500">
                            {h.by.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                            {h.by}
                          </span>
                          <span className="ml-auto shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                            {formatRelative(h.at)}
                          </span>
                        </div>
                        <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-5 text-zinc-700 dark:text-zinc-200">
                          {h.text}
                        </p>
                        <button
                          onClick={() => copy("text", h.text)}
                          className="self-end text-xs font-medium text-zinc-500 transition hover:text-cyan-500 dark:text-zinc-400"
                        >
                          Copiar
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            </details>

            <div className="flex flex-col gap-2">
              <details className="group rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
                <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-600 transition hover:text-cyan-500 dark:text-zinc-300">
                  Personas conectadas ({room.participants.length})
                  <span className="text-xs text-zinc-400 transition group-open:rotate-180">▾</span>
                </summary>
                <div className="px-4 pb-4">
                  {room.participants.length === 0 && (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Nadie conectado aún.
                    </p>
                  )}
                  <ul className="flex flex-col gap-2">
                    {room.participants.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800/60"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-500">
                          {p.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                          {p.name}
                          {p.id === pid && (
                            <span className="ml-1.5 text-xs text-cyan-500">(tú)</span>
                          )}
                        </span>
                        <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      </li>
                    ))}
                  </ul>
                </div>
              </details>

              <details className="group rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
                <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-600 transition hover:text-cyan-500 dark:text-zinc-300">
                  Compartir sala
                  <span className="text-xs text-zinc-400 transition group-open:rotate-180">▾</span>
                </summary>
                <div className="flex flex-col items-center gap-3 px-4 pb-4">
                  <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200 dark:ring-zinc-700">
                    <QRCode value={roomUrl} size={130} />
                  </div>
                  <button
                    onClick={() => copy("link", roomUrl)}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-cyan-400 dark:border-zinc-700 dark:text-zinc-200"
                  >
                    {copied === "link" ? "¡Enlace copiado!" : "Copiar enlace de la sala"}
                  </button>
                </div>
              </details>

              <details className="group rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
                <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-600 transition hover:text-cyan-500 dark:text-zinc-300">
                  Archivos ({room.files.length})
                  <span className="text-xs text-zinc-400 transition group-open:rotate-180">▾</span>
                </summary>
                <div className="flex flex-col gap-3 px-4 pb-4">
                  <div
                    onDrop={onDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-white px-6 py-8 text-center transition hover:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-900/60"
                  >
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                      Arrastra archivos aquí
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      o selecciónalos desde tu dispositivo
                    </p>
                    <label className="mt-1 cursor-pointer rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-400">
                      Elegir archivos
                      <input
                        type="file"
                        multiple
                        onChange={onInputChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {uploading && (
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                          Subiendo {uploading.name}
                        </span>
                        <span className="ml-3 shrink-0 text-zinc-500 dark:text-zinc-400">
                          {uploading.progress}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-cyan-500 transition-all"
                          style={{ width: `${uploading.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {room.files.length === 0 && (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      Aún no hay archivos en la sala.
                    </p>
                  )}
                  <ul className="flex flex-col gap-2">
                    {room.files.map((f) => (
                      <li
                        key={f.id}
                        className="flex flex-col gap-2 rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800/60"
                      >
                        <div className="flex items-center gap-3">
                          <span className="h-9 w-9 shrink-0 rounded-lg bg-cyan-500/20 text-center text-lg leading-9 text-cyan-500">
                            📄
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                              {f.name}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {formatBytes(f.size)} · {f.uploadedBy}
                            </p>
                          </div>
                          <a
                            href={`/api/rooms/${cleanCode}/files/${f.id}`}
                            className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                          >
                            Descargar
                          </a>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() =>
                              copy(
                                "link",
                                `${window.location.origin}/api/rooms/${cleanCode}/files/${f.id}`
                              )
                            }
                            className="text-xs font-medium text-zinc-500 transition hover:text-cyan-500 dark:text-zinc-400"
                          >
                            Copiar enlace
                          </button>
                          <button
                            onClick={() => deleteFile(f.id)}
                            className="text-xs font-medium text-zinc-500 transition hover:text-red-500 dark:text-zinc-400"
                          >
                            Borrar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>

              <p className="px-2 text-xs text-zinc-400 dark:text-zinc-600">
                Texto: 64 KB · Límite por archivo: {formatBytes(room.limits.maxFileBytes)} ·{" "}
                {formatBytes(room.limits.maxRoomBytes)} por sala · Expira en {expiresIn}
              </p>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
              <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {draft === ""
                      ? "Pega un texto arriba para compartirlo"
                      : copied === "text"
                        ? "Texto en tu portapapeles"
                        : "Listo para copiar"}
                  </span>
                  <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {pending
                      ? "Enviando..."
                      : draft === ""
                        ? "Se sincroniza solo"
                        : room.textBy
                          ? `Actualizado por ${room.textBy}`
                          : "Sincronizado"}
                  </span>
                </div>
                <button
                  onClick={() => copy("text", draft, true)}
                  disabled={draft === ""}
                  className="shrink-0 rounded-2xl bg-cyan-500 px-8 py-4 text-lg font-bold text-zinc-950 transition hover:bg-cyan-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copied === "text" ? "¡Copiado!" : "Copiar"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}