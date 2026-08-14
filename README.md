# Qroom

Transfer files from your PC to your iPhone (or between any devices) in seconds — using **temporary rooms**. Create a room, share the code or scan the QR, and everyone connected can upload and download files between each other.

No accounts. No sign-ups. No cables. Just a room.

## Try it live

The app is hosted and ready to use: **[https://qroom-58ds.onrender.com](https://qroom-58ds.onrender.com)**

### How it works

1. **Create a room** — you instantly get a short 6-character code and a QR.
2. **Share it** — friends (or your own phone) join by typing the code or scanning the QR.
3. **Say who you are** — just a name, no password.
4. **See everyone live** — connected people appear in real time.
5. **Send files** — upload on one device, download on another.

## Features

- Join via a **6-character code** or **QR** (generated with `react-qr-code`).
- No login: just enter a **name** to be identified.
- Live list of **connected people** (real time via **Server-Sent Events**).
- **Multi-user** rooms.
- Uploads up to **5 MB per file**, **100 MB per room**.
- Rooms are cleaned up automatically **24 hours** after creation.
- Spanish UI, responsive and mobile-friendly (iPhone).

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router + Turbopack)
- React 19 · TypeScript · Tailwind CSS v4
- [pnpm](https://pnpm.io) as the package manager

## Run it locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and create a room.

> The store is **volatile**: rooms and files live in server memory and are lost on restart. This is intentional for the MVP and it's why the app runs on a **single server instance** (real-time SSE + memory).

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

## Project documentation

Full project context, decisions and roadmap live in [`opencode/PROYECTO.md`](opencode/PROYECTO.md).

## Deployment

Currently hosted on **Render** as an always-on Node.js service (start with `pnpm start`). Because of the in-memory store and SSE, it should run on a **single instance** — avoid multi-instance serverless platforms (e.g. Vercel) where possible.

### Branches

- `master` — working branch: all the changes and experiments done locally.
- `release` — what is actually deployed to the live site (Render builds from this branch).
