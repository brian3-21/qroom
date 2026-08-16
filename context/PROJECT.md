# Qroom — Project Context

This document is the source of context for any AI working on this project. Read it before implementing or modifying code.

## What it is

A web app to **copy/paste text between devices instantly** (PC ↔ iPhone, or between any devices) using **temporary rooms**. It's a "peer room" system: someone creates a room, others join with a code or by scanning a QR code, and the room acts as a **shared clipboard**: a single text box that **syncs live to every connected device**. Paste on the phone, copy it on the PC seconds later — no external apps (Telegram, etc.) needed. Secondarily, you can **attach files** to the room.

## Why this approach (change of direction, Aug 14, 2026)

The app started as file transfer (v1). The original goal was speed, but it turned out that **transferring large files needs a fast internet connection, which the user doesn't always have**. The real recurring problem is different: **getting text** from one device to another (codes, links, messages, data) several times a day, and it needs to be done **fast**.

Text weighs almost nothing → **it works well even on slow connections**. That's why the app pivots to **text as the central feature**, keeping files only as **optional attachments**.

## Design principle: minimalism

> **Priority #1: SPEED.** Qroom exists to move text between devices *faster* than any alternative. Every feature and pixel is judged by: *does this help get the text on the other device sooner?* If it adds a second of friction, it's out.

- The interface must have **only what's needed** to paste, see, and copy text. **No clutter**.
- Every UI decision is validated with: *does this help me get text from one device to another faster?* If not, remove it or hide it.
- Home: only "create room" and "join room" (name + code).
- Room: **one big text box** (the shared clipboard), a **copy** action with visual feedback, and compact participants info. Code always visible (tap to copy). The QR and extras live collapsed/hidden, not front and center. No feeds, no post lists, no notes — just one box that mirrors on every device.

## Usage flow

1. A user **creates a room** → gets a **short code** and a **QR**.
2. Other users **join** by entering the code or scanning the QR.
3. **No login or sign-up**: just a **name/alias** to identify yourself.
4. Anyone **pastes text into the shared box** → the text is **instantly updated on every device** in the room (SSE).
5. On the other device, the text is already there — **copy it with one tap** (Clipboard API).
6. Optional: **attach files** to the room (shown with download links).

## Functional requirements (text v1)

- Create a room and join via **short code** (6 chars) or **QR**.
- Join with just a **name** (no passwords, no accounts).
- **Shared clipboard**: one text value per room that **reaches all connected devices in real time** (SSE). Whoever pastes/edits overwrites it; everyone sees the latest.
- **One-tap copy**: a prominent copy action puts the current text in the clipboard (Clipboard API), with visual feedback.
- **Editable**: the box is editable; typing or pasting syncs to the room.
- **Attach files** optionally to the room (keeps v1 capability).
- **Multi-device** and multi-user rooms.
- **Limits**: max text value per room (e.g. 64 KB). Attachments: 5 MB per file · 100 MB per room.
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

Automatically loaded from `.agents/skills/<name>/SKILL.md` by AI agents. The origin and hash of each skill is recorded in `skills-lock.json`.

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
2. **Unified model**: the room has a **single shared text value** `Room.text` (+ `textBy`, `updatedAt`). It's a shared clipboard, **not** a list of notes/entries. Whoever writes overwrites it; SSE mirrors it everywhere instantly. Files attach to the room, not to individual posts.
3. **Copying is one tap**: the primary action is **copying the current text** (`navigator.clipboard.writeText`), ideally also **auto-selecting** the box so that even a plain copy (Ctrl/Cmd+C) works on any device.
4. **State**: still **in server memory** (`globalThis` pattern to survive HMR). Lost on restart (accepted). Text is small, so memory isn't a concern.
5. **QR**: the **`react-qr-code`** library (SVG, offline). The QR encodes the full room URL. In the final UI it stays accessible but **collapsed** to avoid clutter (the creator needs it once for the other device).
6. **Expiration**: **24-hour** rooms from creation, lazy cleanup on access + periodic store sweep.
7. **No login**: just a name/alias; `clientId` in localStorage to avoid duplicates on reload.
8. **Text limit**: a **single 64 KB value** per room (covers any pasted text with huge headroom). Attachments keep 5 MB/file and 100 MB/room.
9. **Minimalist UI**: nothing that doesn't help paste/view/copy. See "Design principle: minimalism".
10. **Speed rules**: debounced live sync on type (small payload, e.g. send on paste/blur + a "send" action), optimistic UI, no confirmation screens, no analytics that slow the first paint.

## Architecture

- **In-memory server store** (`lib/store.ts`): `globalThis` to survive HMR in dev.
  - `Room = { code, createdAt, participants[], text, textBy, updatedAt, history[], files[] }`.
  - Limits: text value 64 KB per room; files 5 MB/file and 100 MB/room.
  - Expiration: 24 h from `createdAt`.
- **API routes** (`app/api/`):
  - `POST /api/rooms` → create room, returns code.
  - `POST /api/rooms/join` → join with code + name, returns participant.
  - `GET /api/rooms/[code]/stream` → SSE with participants + **shared text** in real time.
  - `POST /api/rooms/[code]/text` → set the shared text (JSON `{ text, by }`), syncs to all devices.
  - `POST /api/rooms/[code]/copy` → record a history entry (JSON `{ text, by }`), fired from a client's copy action.
  - `POST /api/rooms/[code]/files` → attach a file to the room (multipart, validates limits).
  - `GET /api/rooms/[code]/files/[fileId]` → download · `DELETE` → delete.
  - `DELETE /api/rooms/[code]/participant/[pid]` → leave the room.
- **Pages**:
  - `/` → minimalist landing: create room or join (name + code).
  - `/sala/[code]` → room: code (tap to copy), **one big shared text box** (live sync), a prominent **copy** action, optional file attach, compact participants, collapsed QR.

## Suggested phases

**Phase 1 (v1) — File transfer (archived Aug 14, 2026):**
The files MVP was implemented (in-memory store, SSE, QR, 5 MB/100 MB limits, 24 h expiration). It's **dropped as the central feature** due to the fast-internet requirement and because it wasn't fast for the user. The file code is reused as room attachments.

**Phase 2 — Shared clipboard MVP (implemented, Aug 16, 2026):**
- **One shared text box**: paste/type on any device → live sync (SSE) to all → copy on the other device.
- Copy with one tap (Clipboard API) with visual feedback; the box auto-selects its content on tap.
- Sync strategy: debounced (500 ms) + optimistic on paste/blur; remote text is not applied while the user is typing (applied on blur to avoid clobbering).
- **API route added**: `POST /api/rooms/[code]/text` (`{ text, by }`), model now includes `Room.text / textBy / updatedAt` (64 KB limit, `MAX_TEXT_BYTES`).
- **History (added Aug 16, 2026)**: an entry `{ id, text, by, at }` is appended to `Room.history` (last 30, `MAX_HISTORY_ITEMS`) **only when a participant copies the shared text** (via `POST /api/rooms/[code]/copy`, fired from the main copy button — typing/pasting alone does NOT create entries; consecutive duplicates of the last entry are skipped). The entry's `by` is the person who copied. The **current shared text is pinned at the top of the panel as a live entry** (derived client-side from `room.text/textBy/updatedAt`, not stored, shown with a "escribiendo…" badge) so the last text typed is always reachable from any device; it disappears once a copy turns it into the newest permanent entry (avoiding duplicates). Shown in a collapsed `<details>` panel under the text box, newest first, with author avatar, relative time and a per-entry copy button. The current text stays the protagonist.
- Files are **kept but demoted to a subtle collapsed `<details>` panel** (not the idea of the app). Text is the protagonist: one big textarea, a prominent "Copiar texto" button, compact participants/QR in collapsed panels.
- Home and metadata now talk about text, not file transfer.

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