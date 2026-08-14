import HomeClient from "@/components/HomeClient";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black sm:px-6">
      <section className="w-full max-w-2xl text-center">
        <p className="mb-3 text-sm font-bold uppercase tracking-[0.4em] text-cyan-500">
          Qroom
        </p>
        <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          Transfiere archivos de tu PC a tu iPhone al instante
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-7 text-zinc-600 dark:text-zinc-400">
          Crea una sala, comparte el código o el QR, y todos los conectados
          pueden subir y descargar archivos. Sin cuentas, sin esperas. Hasta 5 MB
          por archivo y 100 MB por sala.
        </p>
      </section>
      <section className="mt-10 w-full max-w-2xl">
        <HomeClient />
      </section>
    </main>
  );
}