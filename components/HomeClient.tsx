"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getClientId, setPid, setStoredName } from "@/lib/client";

type Tab = "create" | "join";

const labelClass =
  "font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-faint";
const inputClass =
  "w-full border-2 border-fg bg-background px-3 py-3 font-mono text-sm text-fg placeholder-faint outline-none transition focus:border-accent focus:bg-accent-soft/40";
const btnPrimaryClass =
  "border-2 border-fg bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-on-accent shadow-[3px_3px_0_0_var(--q-fg)] transition hover:bg-accent-strong active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-40 sm:text-sm";

export default function HomeClient() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<Tab | null>(null);
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

  const switchTab = (next: Tab) => {
    setTab(next);
    setError("");
  };

  return (
    <section className="border-2 border-fg bg-card p-5 sm:p-7">
      <div
        role="tablist"
        aria-label="Acciones de sala"
        className="grid grid-cols-2 gap-[2px] border-2 border-fg bg-fg"
      >
        <button
          role="tab"
          aria-selected={tab === "create"}
          onClick={() => switchTab("create")}
          disabled={busy !== null}
          className={`py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] transition disabled:opacity-50 sm:text-sm ${
            tab === "create"
              ? "bg-fg text-background"
              : "bg-card text-muted hover:text-fg"
          }`}
        >
          [ crear ]
        </button>
        <button
          role="tab"
          aria-selected={tab === "join"}
          onClick={() => switchTab("join")}
          disabled={busy !== null}
          className={`py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] transition disabled:opacity-50 sm:text-sm ${
            tab === "join"
              ? "bg-fg text-background"
              : "bg-card text-muted hover:text-fg"
          }`}
        >
          [ unirse ]
        </button>
      </div>

      {tab === "create" ? (
        <div role="tabpanel" className="flex flex-col gap-5 pt-6">
          <p className="font-mono text-xs leading-6 text-muted sm:text-sm">
            Recibirás un código de 6 letras y un QR. Pega un texto en un
            dispositivo y cópialo en cualquier otro.
          </p>
          <form onSubmit={create} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>nombre</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ana"
                maxLength={40}
                required
                autoComplete="nickname"
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null}
              aria-busy={busy === "create"}
              className={btnPrimaryClass}
            >
              {busy === "create" ? "creando…" : "[ crear sala ]"}
            </button>
          </form>
        </div>
      ) : (
        <div role="tabpanel" className="flex flex-col gap-5 pt-6">
          <p className="font-mono text-xs leading-6 text-muted sm:text-sm">
            Escanea el QR que te compartieron o escribe el código de la sala,
            tal como aparece en la pantalla del otro dispositivo.
          </p>
          <form onSubmit={join} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>nombre</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ana"
                maxLength={40}
                required
                autoComplete="nickname"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>código de sala</span>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="AB3XK9"
                maxLength={6}
                required
                autoComplete="off"
                className={`${inputClass} uppercase tracking-[0.3em]`}
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null}
              aria-busy={busy === "join"}
              className={btnPrimaryClass}
            >
              {busy === "join" ? "entrando…" : "[ entrar a la sala ]"}
            </button>
          </form>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-5 border-2 border-danger bg-danger/10 px-3 py-2.5 font-mono text-xs leading-5 text-danger"
        >
          [!] {error}
        </div>
      )}

      <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
        salas de 24 h · sin cuentas · sin instalación
      </p>
    </section>
  );
}