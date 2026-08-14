# Qroom — Project Context

This document is the source of context for any AI working on this project. Read it before implementing or modifying code.

## What it is

A web app to **copy/paste text between devices instantly** (PC ↔ iPhone, or between any devices) using **temporary rooms**. It's a "peer room" system: someone creates a room, others join with a code or by scanning a QR code, and every connected device can **paste text that appears instantly on all devices** and **copy it with a single tap**. Secondarily, you can **attach files** to a piece of text.

## Why this approach (change of direction, Aug 14, 2026)

The app started as file transfer (v1). The original goal was speed, but it turned out that **transferring large files needs a fast internet connection, which the user doesn't always have**. The real recurring problem is different: **getting text** from one device to another (codes, links, messages, data) several times a day, and it needs to be done **fast**.

Text weighs almost nothing → **it works well even on slow connections**. That's why the app pivots to **text as the central feature**, keeping files only as **optional attachments**.

## Design principle: minimalism

- The interface must have **only what's needed** to paste, see, and copy text. **No clutter**.
- Every UI decision is validated with: *does this help me paste/copy text faster?* If not, remove it or hide it.
- Home: only "create room" and "join room" (name + code).
- Room: participants (compact), one **big text box** to paste, and the **list of notes** with one-tap copy. Code always visible (tap to copy). The QR and extras live collapsed/hidden, not front and center.

## Usage flow

1. A user **creates a room** → gets a **short code** and a **QR**.
2. Other users **join** by entering the code or scanning the QR.
3. **No login or sign-up**: just a **name/alias** to identify yourself.
4. Anyone **pastes a text** → it appears **instantly on all devices** in the room (SSE).
5. Anyone **taps the text** → it's copied to their clipboard (Clipboard API).
6. Optional: **attach a file** to a note (shown next to the text, with download).

## Functional requirements (text v1)

- Create a room and join via **short code** (6 chars) or **QR**.
- Join with just a **name** (no passwords, no accounts).
- **Paste text** that reaches **all** connected devices in real time (SSE). Including the sender's own view (confirms it arrived).
- **One-tap copy**: tapping a note copies the whole text to the clipboard.
- The room's text history is kept as **notes** (text + author + time) and is visible to everyone.
- **Attach files** to a note optionally (keeps v1 capability).
- **Multi-device** and multi-user rooms.
- **Limits**: max text per note (e.g. 64 KB) and per room (e.g. 1 MB accumulated, with FIFO purging of the oldest text). Attachments: 5 MB per file · 100 MB per room.
- Expiration: **24 hours** from creation; text is lost (in-memory).
- The app must feel **light and fast** even on slow connections.

## Current stack (installed and verified)

- **Next.js 16.3.0** (App Router + Turbopack)
- **React 19.2.8**, **TypeScript 5**, **Tailwind CSS v4**
- **pnpm 11.5.0** (package manager) · Node v24.13.0 · Windows 11
- Project path: `E:\code\qroom\qroom`
- Dev server: `pnpm dev` → http://localhost:3000 (verified, works)
- Lint: `pnpm lint` (ESLint 9 with `eslint-config-next`)

## Environment constraints

- The npm registry connection is **slow and unstable** (intermittent `ECONNRESET` errors). Avoid adding unnecessary dependencies; if an install fails, retry.
- The `next` package in package.json is pinned to `16.3.0` (don't move to `latest` unless necessary).

## Current project structure

- `app/` → pages and API routes (see "Architecture").
- `public/` → static assets.
- `lib/` → in-memory server store (`lib/store.ts`).
- `.agents/skills/` → installed dev skills (see "Installed skills").
- No database or global state.

## Installed skills (Aug 14, 2026)

Automatically loaded from `.agents/skills/<name>/SKILL.md` by opencode. The origin and hash of each skill is recorded in `skills-lock.json`.

| Skill | Origin |
| --- | --- |
| accessibility, seo | `addyosmani/web-quality-skills` |
| composition-patterns, react-best-practices | `vercel-labs/agent-skills` |
| frontend-design | `anthropics/skills` |
| next-best-practices, next-cache-components, next-upgrade | `vercel-labs/next-skills` |
| nodejs-backend-patterns, typescript-advanced-types | `wshobson/agents` |
| nodejs-best-practices | `sickn33/antigravity-awesome-skills` |
| tailwind-css-patterns | `giuseppe-trisciuoglio/developer-kit` |

Most relevant to Qroom: `react-best-practices`, `next-best-practices`, `tailwind-css-patterns`, `typescript-advanced-types`, `nodejs-backend-patterns`, `frontend-design`, `composition-patterns`, `accessibility`, `seo`.

## Decisions made (Aug 14, 2026)

1. **Real time**: **Server-Sent Events (SSE)** — the server pushes changes instantly. No external libraries, route handler with `ReadableStream`.
2. **Unified model**: the room's unit is a **note** `{ id, text, createdAt, by, files[] }`. A pasted text is a note without files; if files are attached, they travel with the note. This replaces the v1 files-only model.
3. **Copying**: the primary action is **tapping the note to copy it** (`navigator.clipboard.writeText`). Ideally with visual feedback ("Copied!").
4. **State**: still **in server memory** (`globalThis` pattern to survive HMR). Lost on restart (accepted). Text is small, so memory isn't a concern.
5. **QR**: the **`react-qr-code`** library (SVG, offline). The QR encodes the full room URL. In the final UI it stays accessible but **collapsed** to avoid clutter (the creator needs it once for the other device).
6. **Expiration**: **24-hour** rooms from creation, lazy cleanup on access + periodic store sweep.
7. **No login**: just a name/alias; `clientId` in localStorage to avoid duplicates on reload.
8. **Text limits**: per note (64 KB) and per room (1 MB accumulated). If a note exceeds the room, the **oldest notes are purged** (FIFO). Attachments keep 5 MB/file and 100 MB/room.
9. **Minimalist UI**: nothing that doesn't help paste/view/copy. See "Design principle: minimalism".

## Architecture

- **In-memory server store** (`lib/store.ts`): `globalThis` to survive HMR in dev.
  - `Room = { code, createdAt, participants[], notes[] }`, where `Note = { id, text, createdAt, by, files[] }`.
  - Limits: text per note and per room (with FIFO purge), files 5 MB/file and 100 MB/room.
  - Expiration: 24 h from `createdAt`.
- **API routes** (`app/api/`):
  - `POST /api/rooms` → create room, returns code.
  - `POST /api/rooms/join` → join with code + name, returns participant.
  - `GET /api/rooms/[code]/stream` → SSE with participants + **notes** in real time.
  - `POST /api/rooms/[code]/notes` → publish a text note (JSON).
  - `POST /api/rooms/[code]/notes/[noteId]/files` (optional) → attach a file to a note.
  - `GET /api/rooms/[code]/files/[fileId]` → download · `DELETE` → delete.
  - `DELETE /api/rooms/[code]/participant/[pid]` → leave the room.
- **Pages**:
  - `/` → minimalist landing: create room or join (name + code).
  - `/sala/[code]` → room: code (tap to copy), compact participants, **big box to paste text**, list of notes (tap to copy), optional file attachment, collapsed QR.

## Suggested phases

**Phase 1 (v1) — File transfer (archived Aug 14, 2026):**
The files MVP was implemented (in-memory store, SSE, QR, 5 MB/100 MB limits, 24 h expiration). It's **dropped as the central feature** due to the fast-internet requirement. The file code can be reused as note attachments.

**Phase 2 — Text MVP (in progress):**
- **Notes** model: paste text → arrives via SSE → copy with one tap.
- Attach files to a note (reusing v1).
- Minimalist UI. Text limits with FIFO purge.

**Phase 3 — Robustness:**
- Persistence: SQLite (Drizzle or Prisma) or disk storage.
- Friendlier progress/confirmations, metrics.

## Decision: hosting on the internet (Aug 14, 2026)

- **Testing on the local network is abandoned** (the iPhone couldn't reach the PC over WiFi/Windows firewall). The real goal is to use Qroom from several devices, so the path is **hosting the app on the internet**.
- Deployment note: the store is **in server memory** → it needs **a single instance** (SSE + memory don't work well behind multiple workers). **Vercel isn't ideal**; use an always-on Node VPS/server (Railway, Render, Fly, DigitalOcean).
- With the pivot to text, traffic weight is minimal (only text + small attachments), viable on free plans.
- Upload with local `pnpm dev` remains pending port-forwarding; when hosted, the QR will encode the public URL and work from the iPhone.
- After deploy, re-test on the iPhone: create a room from the PC, scan the QR, paste text from one device and copy it on the other.

## Branches

- `master` — working branch: local changes and experiments.
- `dev` — current development branch (where v1 was built and where the text pivot happens).
- `release` — what's deployed to the live site (Render builds from this branch).