# Qroom

Aplicación web para transferir archivos del PC al iPhone (y entre dispositivos) usando **salas temporales**. Crea una sala, comparte el código o escanea el QR, y todos los conectados pueden subir y descargar archivos sin cuentas ni registros.

## Características (Fase 1 — MVP)

- Crear sala y unirse con **código corto** o **QR** (generado con `react-qr-code`).
- Entrada sin login: solo un **nombre** para identificarse.
- Lista de **personas conectadas en tiempo real** mediante **Server-Sent Events (SSE)**.
- Salas **multi-usuario**.
- Subida de archivos: máximo **5 MB por archivo**, **100 MB por sala**.
- Las salas se limpian automáticamente tras **24 horas** desde su creación.
- Interfaz en español, responsive y optimizada para móvil (iPhone).

## Stack

- [Next.js 16](https://nextjs.org) (App Router + Turbopack)
- React 19 · TypeScript · Tailwind CSS v4
- [pnpm](https://pnpm.io) como gestor de paquetes

## Empezar

```bash
pnpm install
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000) y crea una sala.

## Scripts

```bash
pnpm dev      # servidor de desarrollo
pnpm build    # build de producción
pnpm start    # sirve el build de producción
pnpm lint     # ESLint
```

## Arquitectura

- **`lib/store.ts`** — store de salas en memoria del servidor (metadatos + buffers de archivos), validación de límites (5 MB/archivo, 100 MB/sala) y expiración de 24 h.
- **`app/api/rooms/`** — API de salas: crear, unirse, salir, snapshot, stream SSE, subir/descargar/borrar archivos.
- **`app/`** — portada (crear/unirse) y `app/sala/[code]` con QR, participantes en vivo y transferencia de archivos.

El store es **volátil**: al reiniciar el servidor se pierden las salas y los archivos. Necesita una **única instancia** del servidor (SSE + memoria).

## Documentación del proyecto

El contexto completo y las decisiones del proyecto están en [`opencode/PROYECTO.md`](opencode/PROYECTO.md).

## Despliegue

Build de Node.js siempre activo: `pnpm install && pnpm build` y `pnpm start`. No recomendado en plataformas serverless multi-instancia (Vercel) por el store en memoria y el SSE.