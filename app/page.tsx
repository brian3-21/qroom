import ThemeToggle from "@/components/ThemeToggle";
import HomeClient from "@/components/HomeClient";

const features = [
  "Pega y sincroniza al instante",
  "Únete con un QR desde cualquier pantalla",
  "Salas de 24 h que expiran solas",
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between border-b-2 border-fg px-4 py-3.5 sm:px-6">
        <span className="font-mono text-base font-bold tracking-tight">
          QROOM<span className="text-accent">~$</span>
        </span>
        <ThemeToggle />
      </nav>

      <section className="mx-auto w-full max-w-3xl flex-1 px-4 pt-12 pb-10 sm:pt-16">
        <h1 className="q-rise font-mono text-[2rem] font-bold leading-[1.15] tracking-tight sm:text-6xl">
          Un portapapeles compartido,{" "}
          <span className="whitespace-nowrap">
            al instante
            <span
              aria-hidden
              className="q-blink ml-1.5 inline-block h-[0.95em] w-[0.5em] translate-y-[0.1em] bg-accent"
            />
          </span>
        </h1>
        <p
          className="q-rise mt-5 max-w-xl font-mono text-sm leading-7 text-muted sm:text-base"
          style={{ animationDelay: "80ms" }}
        >
          Crea una sala, comparte el código o el QR y pega un texto en tu PC
          para copiarlo en tu teléfono en segundos. Sin cuentas, sin esperas.
        </p>
        <ul
          className="q-rise mt-7 flex flex-col gap-2.5 font-mono text-xs sm:text-sm"
          style={{ animationDelay: "160ms" }}
        >
          {features.map((f) => (
            <li key={f} className="flex items-baseline gap-2.5 text-muted">
              <span aria-hidden className="text-accent">
                &gt;
              </span>
              {f}
            </li>
          ))}
        </ul>
      </section>

      <section
        className="q-rise mx-auto w-full max-w-2xl px-4 pb-20 sm:px-6"
        style={{ animationDelay: "240ms" }}
      >
        <HomeClient />
      </section>
    </main>
  );
}