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
import { formatBytes } from "@/lib/format";

type Status = "loading" | "notfound" | "ok";

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
  const [copied, setCopied] = useState(false);
  const [myName, setMyName] = useState("");
  const joinedRef = useRef(false);
  const uploadingRef = useRef(false);

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

  const applySnapshot = useCallback(
    (snapshot: RoomSnapshot) => {
      setRoom(snapshot);
      const pid = getPid(snapshot.code);
      const isJoined = Boolean(pid && snapshot.participants.some((p) => p.id === pid));
      joinedRef.current = isJoined;
      setJoined(isJoined);
      if (isJoined) setMyName(snapshot.participants.find((p) => p.id === pid)?.name ?? "");
    },
    []
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${cleanCode}`);
        if (!res.ok) throw new Error("notfound");
        const snapshot: RoomSnapshot = await res.json();
        if (!active) return;
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

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("No se pudo copiar el texto");
    }
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
              onClick={() => copy(cleanCode)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm font-semibold tracking-[0.2em] text-zinc-900 transition hover:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {cleanCode}
            </button>
            {copied && (
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

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
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

        {room && (
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <section className="flex flex-col gap-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Personas conectadas ({room.participants.length})
                </h2>
                {room.participants.length === 0 && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Nadie conectado aún.</p>
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

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Compartir sala
                </h2>
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200 dark:ring-zinc-700">
                    <QRCode value={roomUrl} size={130} />
                  </div>
                  <button
                    onClick={() => copy(roomUrl)}
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-cyan-400 dark:border-zinc-700 dark:text-zinc-200"
                  >
                    {copied ? "¡Enlace copiado!" : "Copiar enlace de la sala"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                <p>
                  Límites: {formatBytes(room.limits.maxFileBytes)} por archivo ·{" "}
                  {formatBytes(room.limits.maxRoomBytes)} por sala
                </p>
                <p className="mt-1">
                  Usado: {formatBytes(room.totalBytes)} · Expira en {expiresIn}
                </p>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              {joined ? (
                <>
                  <div
                    onDrop={onDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-white px-6 py-10 text-center transition hover:border-cyan-400 dark:border-zinc-700 dark:bg-zinc-900/60"
                  >
                    <p className="font-medium text-zinc-700 dark:text-zinc-200">
                      Arrastra archivos aquí
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      o selecciónalos desde tu dispositivo
                    </p>
                    <label className="mt-2 cursor-pointer rounded-xl bg-cyan-500 px-5 py-2.5 font-semibold text-zinc-950 transition hover:bg-cyan-400">
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
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
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

                  <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Archivos ({room.files.length})
                    </h2>
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
                                copy(`${window.location.origin}/api/rooms/${cleanCode}/files/${f.id}`)
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
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/60">
                  <p className="text-3xl">🔒</p>
                  <p className="font-medium text-zinc-800 dark:text-zinc-100">
                    Entra a la sala para ver y subir archivos
                  </p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Las personas conectadas se ven al instante una vez dentro.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}