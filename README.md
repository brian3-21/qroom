# Qroom

A **shared clipboard** between your PC, your iPhone (or any devices) **in seconds** — using **temporary rooms**. Create a room, share the code or scan the QR, paste a text on your phone, and copy it on your PC right away. One big shared box that syncs live.

No accounts. No waiting. **It exists to be fast** — ideal when you don't have fast internet, because **text weighs almost nothing and travels instantly**.

## Try it live

The app is hosted and ready to use: **[https://qroom-58ds.onrender.com](https://qroom-58ds.onrender.com)**

### How it works

1. **Create a room** — you get a short 6-character code and a QR.
2. **Share it** — friends (or your own phone) join by typing the code or scanning the QR.
3. **Say who you are** — just a name, no password.
4. **Paste a text into the box** — it updates instantly on every connected device.
5. **Copy it on the other device** — one tap, and it's in your clipboard.
6. **Attach files** (optional) — if you need to, attach a file to the room.

## Features

- **One shared text box** (the room's clipboard): paste → live sync → copy elsewhere.
- **One-tap copy** (Clipboard API) with visual feedback and auto-select.
- Join via a **6-character code** or **QR** (generated with `react-qr-code`).
- No login: just a **name** to identify yourself.
- **Live list** of connected people and the **shared text** (Server-Sent Events).
- **Multi-device** and multi-user rooms.
- Attach files to the room: **5 MB per file · 100 MB per room**.
- **Text limit**: 64 KB per room.
- Rooms auto-expire **24 hours** after creation.
- **Minimalist UI**: one box, one copy button, nothing else. Spanish UI, responsive, mobile-friendly (iPhone).

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

> The store is **volatile**: rooms, notes, and files live in server memory and are lost on restart. This is intentional for the MVP and it's why the app runs on a **single server instance** (realtime SSE + memory).

## Scripts

```bash
pnpm dev      # development server
pnpm build    # production build
pnpm start    # serve the production build
pnpm lint     # ESLint
```

## Architecture

- **`lib/store.ts`** — in-memory store (room metadata + shared text + file buffers), limit validation and 24 h expiry.
- **`app/api/rooms/`** — rooms API: create, join, leave, snapshot, SSE stream, set text, upload/download/delete files.
- **`app/`** — landing (create/join) and `app/sala/[code]` with copyable code, one big synced text box, one-tap copy, attachments, and live participants.

## Project documentation

Full project context, decisions and roadmap live in [`opencode/PROJECT.md`](opencode/PROJECT.md).

## Deployment

Currently hosted on **Render** as an always-on Node.js service (start with `pnpm start`). Because of the in-memory store and SSE, it should run on a **single instance** — avoid multi-instance serverless platforms (e.g. Vercel) where possible. With the text approach, traffic is minimal.

### Branches

- `master` — working branch: all the local changes and experiments.
- `dev` — current development branch (text pivot).
- `release` — what is actually deployed to the live site (Render builds from this branch).