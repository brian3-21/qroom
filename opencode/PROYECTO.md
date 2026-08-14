# Qroom — Contexto del Proyecto

Este documento es la fuente de contexto para cualquier IA que trabaje en este proyecto. Debe leerse antes de implementar o modificar código.

## Qué es

Aplicación web para transferir archivos del PC al iPhone (y entre dispositivos) usando **salas temporales**. Es un sistema tipo "peer room": alguien crea una sala, otros se unen con un código o escaneando un QR, y todos los conectados pueden subir y descargar archivos entre sí.

## Objetivo principal

Transferir archivos de una PC a un iPhone de la forma más rápida y simple posible.

## Flujo de uso

1. Un usuario **crea una sala** → recibe un **código corto** y un **QR**.
2. Otros usuarios **se unen** ingresando el código o escaneando el QR.
3. **No hay login ni registro**: solo se pide un **nombre/apodo** para identificarse.
4. Cuando hay **2 o más personas conectadas**, la web muestra en tiempo real la lista de las personas conectadas a la sala.
5. Cualquier miembro puede **subir archivos** que los demás pueden **descargar**.

## Requisitos funcionales (v1)

- Crear sala y unirse a una sala.
- Unirse mediante **código corto** o **QR** (cada sala tiene su código y su QR).
- Entrar solo con un **nombre** (sin contraseñas, sin cuentas).
- Mostrar en tiempo real las **personas conectadas** en la sala.
- Salas **multi-usuario** (pueden unirse varias personas a la vez).
- Subida de archivos: máximo **5 MB por archivo**.
- Límite total por sala: **100 MB sumando todos los archivos** de la sala.
- Prioridad: **rapidez** y simplicidad de uso.

## Stack actual (ya instalado y verificado)

- **Next.js 16.3.0** (App Router + Turbopack)
- **React 19.2.8**, **TypeScript 5**, **Tailwind CSS v4**
- **pnpm 11.5.0** (gestor de paquetes) · Node v24.13.0 · Windows 11
- Ruta del proyecto: `E:\code\qroom\qroom`
- Dev server: `pnpm dev` → http://localhost:3000 (verificado, funciona)
- Lint: `pnpm lint` (ESLint 9 con `eslint-config-next`)

## Restricciones del entorno

- La conexión al registry npm es **lenta e inestable** (errores `ECONNRESET` intermitentes). Evitar agregar dependencias innecesarias; si una instalación falla, reintentar.
- El paquete `next` en package.json está fijado en `16.3.0` (no mover a `latest` a menos que sea necesario).

## Estructura actual del proyecto

- `app/` → solo `app/page.tsx` (portada) y `app/layout.tsx` (estructura raíz), template por defecto de `create-next-app`.
- `public/` → assets estáticos.
- Sin base de datos, sin API routes, sin estado global aún.

## Decisiones tomadas (14 ago 2026)

1. **Tiempo real**: **Server-Sent Events (SSE)** — el servidor empuja al instante los cambios de participantes y archivos. Sin librerías externas, route handler con `ReadableStream`.
2. **Archivos**: **buffers en memoria del servidor** (máxima velocidad de lectura). Los 100 MB/sala se controlan con validación en el store. Al reiniciar el servidor se pierde todo (aceptado para Fase 1).
3. **QR**: librería **`react-qr-code`** instalada con pnpm (genera SVG, funciona offline). El QR codifica la URL completa de la sala.
4. **Expiración**: las salas duran **24 horas desde su creación** y se limpian automáticamente (limpieza perezosa al acceder + barrido periódico del store).
5. **Sin login**: solo nombre/apodo; el participante obtiene un `clientId` (guardado en localStorage) para no duplicarse al recargar.
6. **Acceso a archivos**: cualquier persona dentro de la sala puede descargar los archivos con su URL directa.

## Arquitectura de la Fase 1

- **Store en memoria del servidor** (`lib/store.ts`): patrón `globalThis` para sobrevivir HMR en dev.
  - `Room = { code (6 chars), createdAt, participants[], files[] }`
  - Límites: **5 MB por archivo**, **100 MB por sala** (suma de todos los archivos).
  - Expiración: 24 h desde `createdAt`.
- **API routes** (`app/api/`):
  - `POST /api/rooms` → crear sala, devuelve código.
  - `POST /api/rooms/join` → unirse con código + nombre, devuelve participante.
  - `GET /api/rooms/[code]/stream` → SSE con participantes + archivos en tiempo real.
  - `POST /api/rooms/[code]/files` → subir archivo (multipart, valida límites).
  - `GET /api/rooms/[code]/files/[fileId]` → descargar · `DELETE` → borrar.
  - `DELETE /api/rooms/[code]/participant/[pid]` → salir de la sala.
- **Páginas**:
  - `/` → portada: crear sala o unirse (solo nombre + código).
  - `/sala/[code]` → sala: código + QR, participantes en vivo (SSE), subida/descarga de archivos.

## Fases sugeridas

**Fase 1 — MVP (implementada el 14 ago 2026):**
- Store en memoria, SSE tiempo real, QR con react-qr-code, límites 5 MB/archivo y 100 MB/sala, expiración 24 h. Ver "Arquitectura de la Fase 1".

**Fase 2 — Robustez:**
- Persistencia: SQLite (Drizzle o Prisma) o guardado en disco con API routes en `app/api/`.
- Gestión de archivos más avanzada (progreso de subida, cancelar, borrar con confirmación).
- Métricas y errores más amigables.

## Decisión: hosting en internet (14 ago 2026)

- **Se abandona probar el MVP en red local.** Motivos: el iPhone no accedía a la PC por WiFi (bloqueo por firewall de Windows / red tipo hotspot, no resuelto al quitar SimpleWall). Al final el objetivo real es usar Qroom desde varios dispositivos, así que el camino es **hostear la app en internet** y probar el MVP ahí.
- El MVP actual funciona completo de forma local (crear/unirse, SSE, subir/descargar, límites) y está verificado con tests manuales.
- Nota técnica para deployment: el store es **en memoria del servidor** (se pierde al reiniciar). Consecuencias:
  - Necesita **una sola instancia** del servidor (SSE + memoria no funcionan bien detrás de varios workers/instancias). En plataformas como Vercel hay que limitar a 1 función (o usar un VPS/servidor Node siempre activo: Railway, Render, Fly.io, DigitalOcean).
  - La **subida con `pnpm dev` local quedó pendiente de port-forwarding** — no es necesario: al hostear, el QR codificará la URL pública y funcionará desde cualquier teléfono.
  - Después del deploy hay que re-probar en el iPhone: crear sala desde el PC, escanear QR, ver participantes en vivo y transferir un archivo real.
- Para hosteos con memoria: **Vercel no es la opción idónea** (estático + funciones efímeras); un **VPS/servidor Node (Railway/Render/Fly/DigitalOcean)** es lo más alineado con el MVP. Decidir plataforma en la próxima sesión.