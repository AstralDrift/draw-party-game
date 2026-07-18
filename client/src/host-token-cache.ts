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

/** Keeps the current display's recovery credential usable when persistence is blocked. */
export class HostTokenCache {
  private readonly memory = new Map<string, string>();

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
    try {
      this.storage?.setItem(hostTokenKey(roomCode), token);
    } catch {
      // Keep hosting available even when browser privacy settings reject storage.
    }
  }

  delete(roomCode: string): void {
    this.memory.delete(roomCode);
    try {
      this.storage?.removeItem(hostTokenKey(roomCode));
    } catch {
      // The rejected credential is still removed from this in-memory session.
    }
  }
}
