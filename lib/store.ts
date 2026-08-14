const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROOM_BYTES = 100 * 1024 * 1024;
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export interface Participant {
  id: string;
  name: string;
  joinedAt: number;
}

export interface RoomFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  uploadedBy: string;
  buffer: Buffer;
}

export interface FileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  uploadedBy: string;
}

export interface Limits {
  maxFileBytes: number;
  maxRoomBytes: number;
}

export interface RoomSnapshot {
  code: string;
  createdAt: number;
  expiresAt: number;
  participants: Participant[];
  files: FileInfo[];
  totalBytes: number;
  limits: Limits;
}

interface Room {
  code: string;
  createdAt: number;
  participants: Map<string, Participant>;
  files: Map<string, RoomFile>;
  totalBytes: number;
}

interface Listener {
  onChange: () => void;
  onDeleted: () => void;
}

export class StoreError extends Error {}

class QroomStore {
  private rooms = new Map<string, Room>();
  private listeners = new Map<string, Set<Listener>>();

  startSweep(): void {
    setInterval(() => this.sweepExpired(), 60_000);
  }

  createRoom(name: string, clientId: string): { room: Room; participant: Participant } {
    let code = "";
    do {
      code = Array.from({ length: CODE_LENGTH }, () =>
        ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
      ).join("");
    } while (this.rooms.has(code));

    const participant: Participant = {
      id: clientId,
      name,
      joinedAt: Date.now(),
    };
    const room: Room = {
      code,
      createdAt: Date.now(),
      participants: new Map([[clientId, participant]]),
      files: new Map(),
      totalBytes: 0,
    };
    this.rooms.set(code, room);
    this.notify(code);
    return { room, participant };
  }

  getRoom(code: string): Room | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    if (Date.now() - room.createdAt > ROOM_TTL_MS) {
      this.deleteRoom(code);
      return null;
    }
    return room;
  }

  joinRoom(code: string, name: string, clientId: string): { room: Room; participant: Participant } | null {
    const room = this.getRoom(code);
    if (!room) return null;
    const existing = room.participants.get(clientId);
    if (existing) {
      existing.name = name;
      return { room, participant: existing };
    }
    const participant: Participant = { id: clientId, name, joinedAt: Date.now() };
    room.participants.set(clientId, participant);
    this.notify(code);
    return { room, participant };
  }

  leaveRoom(code: string, clientId: string): boolean {
    const room = this.getRoom(code);
    if (!room) return false;
    const removed = room.participants.delete(clientId);
    if (removed) this.notify(code);
    return removed;
  }

  addFile(
    code: string,
    info: { name: string; size: number; type: string; buffer: Buffer; uploadedBy: string }
  ): FileInfo | null {
    const room = this.getRoom(code);
    if (!room) return null;
    if (info.size > MAX_FILE_BYTES) {
      throw new StoreError("Cada archivo debe pesar menos de 5 MB");
    }
    if (room.totalBytes + info.size > MAX_ROOM_BYTES) {
      throw new StoreError("La sala alcanzó el límite de 100 MB");
    }
    const file: RoomFile = {
      id: crypto.randomUUID(),
      name: info.name,
      size: info.size,
      type: info.type,
      uploadedAt: Date.now(),
      uploadedBy: info.uploadedBy,
      buffer: info.buffer,
    };
    room.files.set(file.id, file);
    room.totalBytes += file.size;
    this.notify(code);
    return this.toFileInfo(file);
  }

  getFile(code: string, fileId: string): RoomFile | null {
    const room = this.getRoom(code);
    if (!room) return null;
    return room.files.get(fileId) ?? null;
  }

  removeFile(code: string, fileId: string): boolean {
    const room = this.getRoom(code);
    if (!room) return false;
    const file = room.files.get(fileId);
    if (!file) return false;
    room.files.delete(fileId);
    room.totalBytes -= file.size;
    this.notify(code);
    return true;
  }

  snapshot(code: string): RoomSnapshot | null {
    const room = this.getRoom(code);
    if (!room) return null;
    return this.toSnapshot(room);
  }

  subscribe(code: string, listener: Listener): () => void {
    const set = this.listeners.get(code) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(code, set);
    return () => {
      const next = this.listeners.get(code);
      if (!next) return;
      next.delete(listener);
      if (next.size === 0) this.listeners.delete(code);
    };
  }

  private toSnapshot(room: Room): RoomSnapshot {
    return {
      code: room.code,
      createdAt: room.createdAt,
      expiresAt: room.createdAt + ROOM_TTL_MS,
      participants: [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt),
      files: [...room.files.values()]
        .map((f) => this.toFileInfo(f))
        .sort((a, b) => b.uploadedAt - a.uploadedAt),
      totalBytes: room.totalBytes,
      limits: { maxFileBytes: MAX_FILE_BYTES, maxRoomBytes: MAX_ROOM_BYTES },
    };
  }

  private toFileInfo(file: RoomFile): FileInfo {
    return {
      id: file.id,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: file.uploadedAt,
      uploadedBy: file.uploadedBy,
    };
  }

  private notify(code: string): void {
    const set = this.listeners.get(code);
    if (!set) return;
    for (const listener of set) listener.onChange();
  }

  private deleteRoom(code: string): void {
    const set = this.listeners.get(code);
    if (set) {
      for (const listener of set) listener.onDeleted();
    }
    this.rooms.delete(code);
    this.listeners.delete(code);
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.createdAt > ROOM_TTL_MS) this.deleteRoom(code);
    }
  }
}

const GLOBAL_KEY = "__qroom_store__";
type GlobalWithStore = Record<string, unknown>;

function getStore(): QroomStore {
  const g = globalThis as GlobalWithStore;
  if (!g[GLOBAL_KEY]) {
    const instance = new QroomStore();
    instance.startSweep();
    g[GLOBAL_KEY] = instance;
  }
  return g[GLOBAL_KEY] as QroomStore;
}

export const store = getStore();