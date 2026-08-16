"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getClientId, setPid, setStoredName } from "@/lib/client";

export default function HomeClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy("create");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, clientId: getClientId() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear la sala");
      setPid(data.code, data.participant.id);
      setStoredName(data.code, name);
      router.push(`/sala/${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setBusy(null);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy("join");
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode, name, clientId: getClientId() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo entrar a la sala");
      setPid(joinCode.toUpperCase(), data.participant.id);
      setStoredName(joinCode.toUpperCase(), name);
      router.push(`/sala/${joinCode.toUpperCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setBusy(null);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-400";
  const buttonClass =
    "w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-cyan-400 disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className="flex w-full flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-zinc-100">Crear una sala</h2>
        <p className="text-sm text-zinc-400">
          Crea una sala, comparte el código o el QR y pega un texto para tenerlo
          al instante en cualquier otro dispositivo.
        </p>
        <form onSubmit={create} className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            maxLength={40}
            required
            className={inputClass}
          />
          <button type="submit" disabled={busy !== null} className={buttonClass}>
            {busy === "create" ? "Creando..." : "Crear sala"}
          </button>
        </form>
      </section>

      <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-zinc-600">
        <span className="h-px flex-1 bg-zinc-800" />
        o
        <span className="h-px flex-1 bg-zinc-800" />
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-zinc-100">Unirse a una sala</h2>
        <p className="text-sm text-zinc-400">
          Escanea el QR que te compartieron o escribe el código de la sala.
        </p>
        <form onSubmit={join} className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            maxLength={40}
            required
            className={inputClass}
          />
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Código de la sala (ej. AB3XK9)"
            maxLength={6}
            required
            className={`${inputClass} font-mono uppercase tracking-[0.3em]`}
          />
          <button type="submit" disabled={busy !== null} className={buttonClass}>
            {busy === "join" ? "Entrando..." : "Entrar a la sala"}
          </button>
        </form>
      </section>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}