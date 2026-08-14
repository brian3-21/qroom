# Qroom

Web app to transfer files from your PC to your iPhone (and between devices) using **temporary rooms**. Create a room, share the code or scan the QR, and everyone connected can upload and download files — no accounts, no sign-ups.

## Features (Phase 1 — MVP)

- Create a room and join via a **6-character code** or **QR** (generated with `react-qr-code`).
- No login: just enter a **name** to be identified.
- Real-time list of **connected people** via **Server-Sent Events (SSE)**.
- **Multi-user** rooms.
- File uploads: max **5 MB per file**, **100 MB per room**.
- Rooms are cleaned up automatically **24 hours** after creation.
- Spanish UI, responsive and mobile-friendly (iPhone).

## Tech Stack

- [Next.js 16](https://nextjs.org) (App Router + Turbopack)
- React 19 · TypeScript · Tailwind CSS v4
- [pnpm](https://pnpm.io) as the package manager

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and create a room.

## Scripts

```bash
pnpm dev      # development server
pnpm build    # production build
pnpm start    # serve the production build
pnpm lint     # ESLint
```

## Architecture

- **`lib/store.ts`** — in-memory room store (metadata + file buffers), limits validation (5 MB/file, 100 MB/room) and 24 h expiry.
- **`app/api/rooms/`** — rooms API: create, join, leave, snapshot, SSE stream, upload/download/delete files.
- **`app/`** — home page (create/join) and `app/sala/[code]` with QR, live participants and file transfer.

The store is **volatile**: rooms and files are lost when the server restarts. It requires a **single server instance** (SSE + memory).

## Project documentation

Full project context and decisions live in [`opencode/PROYECTO.md`](opencode/PROYECTO.md).

## Deployment

Always-on Node.js service: `pnpm install && pnpm build`, start with `pnpm start`. Not recommended on multi-instance serverless platforms (e.g. Vercel) due to the in-memory store and SSE.