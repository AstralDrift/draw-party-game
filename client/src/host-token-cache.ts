interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageLike | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function hostTokenKey(roomCode: string): string {
  return `draw-party-host-token-${roomCode}`;
}

const ACTIVE_HOST_ROOM_KEY = 'draw-party-active-host-room';

/** Keeps the current display's recovery credential usable when persistence is blocked. */
export class HostTokenCache {
  private readonly memory = new Map<string, string>();
  private activeRoomMemory: string | null = null;

  constructor(private readonly storage: StorageLike | null = browserStorage()) {}

  get(roomCode: string): string | null {
    if (this.memory.has(roomCode)) {
      return this.memory.get(roomCode) ?? null;
    }
    const key = hostTokenKey(roomCode);
    try {
      const persisted = this.storage?.getItem(key);
      if (persisted) {
        this.memory.set(roomCode, persisted);
        return persisted;
      }
    } catch {
      // The in-memory credential is sufficient for this display session.
    }
    return this.memory.get(roomCode) ?? null;
  }

  set(roomCode: string, token: string): void {
    this.memory.set(roomCode, token);
    this.activeRoomMemory = roomCode;
    try {
      this.storage?.setItem(hostTokenKey(roomCode), token);
      this.storage?.setItem(ACTIVE_HOST_ROOM_KEY, roomCode);
    } catch {
      // Keep hosting available even when browser privacy settings reject storage.
    }
  }

  activeRoomCode(): string | null {
    if (this.activeRoomMemory) {
      return this.activeRoomMemory;
    }
    try {
      const roomCode = this.storage?.getItem(ACTIVE_HOST_ROOM_KEY)?.trim().toUpperCase();
      if (roomCode && this.get(roomCode)) {
        this.activeRoomMemory = roomCode;
        return roomCode;
      }
    } catch {
      // A fresh page cannot recover storage that the browser blocks.
    }
    return null;
  }

  delete(roomCode: string): void {
    let persistedActiveRoom: string | null = null;
    try {
      persistedActiveRoom = this.storage?.getItem(ACTIVE_HOST_ROOM_KEY) ?? null;
    } catch {
      // The in-memory active-room marker still tells us whether to clear it.
    }
    this.memory.delete(roomCode);
    if (this.activeRoomMemory === roomCode || persistedActiveRoom === roomCode) {
      this.activeRoomMemory = null;
    }
    try {
      this.storage?.removeItem(hostTokenKey(roomCode));
      if (persistedActiveRoom === roomCode) {
        this.storage?.removeItem(ACTIVE_HOST_ROOM_KEY);
      }
    } catch {
      // The rejected credential is still removed from this in-memory session.
    }
  }
}
