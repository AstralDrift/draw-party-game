import {
  queuePendingRenameAfterDisconnect,
  type PendingRenameIntent
} from './controller';

export const PENDING_RENAME_STORAGE_KEY = 'draw-party-pending-rename';
export const PENDING_RENAME_VERSION = 1;
export const PENDING_RENAME_TTL_MS = 3 * 60 * 60 * 1000;
export const MAX_PENDING_RENAME_BYTES = 2048;

interface RenameStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredPendingRename {
  version: typeof PENDING_RENAME_VERSION;
  roomCode: string;
  clientId: string;
  timestamp: number;
  intent: PendingRenameIntent;
}

function browserSessionStorage(): RenameStorage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

/** Tab-scoped persistence for an explicit rename that has not been acknowledged yet. */
export class PendingRenameCache {
  constructor(
    private readonly storage: RenameStorage | null = browserSessionStorage(),
    private readonly now: () => number = () => Date.now()
  ) {}

  save(roomCode: string, clientId: string, intent: PendingRenameIntent): boolean {
    const record: StoredPendingRename = {
      version: PENDING_RENAME_VERSION,
      roomCode,
      clientId,
      timestamp: this.now(),
      intent
    };
    if (!isValidStoredRename(record)) {
      this.clear();
      return false;
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(record);
    } catch {
      this.clear();
      return false;
    }
    if (serializedBytes(serialized) > MAX_PENDING_RENAME_BYTES) {
      this.clear();
      return false;
    }
    try {
      this.storage?.setItem(PENDING_RENAME_STORAGE_KEY, serialized);
      return this.storage !== null;
    } catch {
      return false;
    }
  }

  restore(roomCode: string, clientId: string): PendingRenameIntent | null {
    let serialized: string | null;
    try {
      serialized = this.storage?.getItem(PENDING_RENAME_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
    if (!serialized) {
      return null;
    }
    if (serializedBytes(serialized) > MAX_PENDING_RENAME_BYTES) {
      this.clear();
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      this.clear();
      return null;
    }
    const now = this.now();
    if (
      !isValidStoredRename(parsed) ||
      !Number.isSafeInteger(now) ||
      parsed.timestamp > now ||
      now - parsed.timestamp > PENDING_RENAME_TTL_MS ||
      parsed.roomCode !== roomCode ||
      parsed.clientId !== clientId
    ) {
      this.clear();
      return null;
    }
    return queuePendingRenameAfterDisconnect(parsed.intent);
  }

  clear(): void {
    try {
      this.storage?.removeItem(PENDING_RENAME_STORAGE_KEY);
    } catch {
      // Rename recovery is optional when session storage is unavailable.
    }
  }
}

function isValidStoredRename(value: unknown): value is StoredPendingRename {
  if (!isRecord(value) || !isRecord(value.intent)) {
    return false;
  }
  return (
    value.version === PENDING_RENAME_VERSION &&
    typeof value.roomCode === 'string' &&
    /^[A-Z0-9]{4}$/.test(value.roomCode) &&
    typeof value.clientId === 'string' &&
    Boolean(value.clientId) &&
    typeof value.timestamp === 'number' &&
    Number.isSafeInteger(value.timestamp) &&
    value.timestamp >= 0 &&
    isValidIntent(value.intent)
  );
}

function isValidIntent(
  value: Record<string, unknown>
): value is Record<string, unknown> & PendingRenameIntent {
  const stateValid = value.state === 'queued' || value.state === 'sent';
  const revisionValid =
    value.sentAfterSnapshotRevision === null ||
    (typeof value.sentAfterSnapshotRevision === 'number' &&
      Number.isSafeInteger(value.sentAfterSnapshotRevision) &&
      value.sentAfterSnapshotRevision >= 0);
  const latestValid =
    value.latestRequestedName === null || validName(value.latestRequestedName);
  return (
    validName(value.requestedName) &&
    validName(value.canonicalNameAtRequest) &&
    stateValid &&
    revisionValid &&
    latestValid &&
    (value.state === 'queued'
      ? value.sentAfterSnapshotRevision === null
      : typeof value.sentAfterSnapshotRevision === 'number')
  );
}

function validName(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && Array.from(value).length <= 24;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function serializedBytes(value: string): number {
  return new Blob([value]).size;
}
