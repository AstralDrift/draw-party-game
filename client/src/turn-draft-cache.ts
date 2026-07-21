import { playerNeedsAction } from './controller';
import { cloneValidDrawing } from './drawing';
import type { DrawingDoc, RoomSnapshot } from './protocol';

export const TURN_DRAFT_STORAGE_KEY = 'draw-party-turn-draft';
export const TURN_DRAFT_VERSION = 1;
export const TURN_DRAFT_TTL_MS = 5 * 60 * 1000;
export const MAX_TURN_DRAFT_BYTES = 1024 * 1024;

interface TurnDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface TurnDraftBase {
  version: typeof TURN_DRAFT_VERSION;
  roomCode: string;
  clientId: string;
  turnToken: number;
  timestamp: number;
}

export interface DrawingTurnDraft extends TurnDraftBase {
  phase: 'drawing';
  drawing: DrawingDoc;
}

export interface GuessTurnDraft extends TurnDraftBase {
  phase: 'guessing';
  currentArtistId: string;
  guess: string;
}

export type TurnDraft = DrawingTurnDraft | GuessTurnDraft;

function browserSessionStorage(): TurnDraftStorage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

/** One tab-scoped, server-turn-bound draft. Votes are intentionally unsupported. */
export class TurnDraftCache {
  constructor(
    private readonly storage: TurnDraftStorage | null = browserSessionStorage(),
    private readonly now: () => number = () => Date.now()
  ) {}

  saveDrawing(snapshot: RoomSnapshot, clientId: string, drawing: unknown): boolean {
    const restored = cloneValidDrawing(drawing);
    if (
      snapshot.phase !== 'drawing' ||
      !canDraft(snapshot, clientId) ||
      !restored ||
      restored.strokes.length === 0
    ) {
      this.clear();
      return false;
    }

    return this.write({
      version: TURN_DRAFT_VERSION,
      roomCode: snapshot.roomCode,
      clientId,
      phase: 'drawing',
      turnToken: snapshot.turnToken,
      timestamp: this.now(),
      drawing: restored
    });
  }

  saveGuess(snapshot: RoomSnapshot, clientId: string, guess: string): boolean {
    if (
      snapshot.phase !== 'guessing' ||
      !canDraft(snapshot, clientId) ||
      typeof snapshot.currentArtistId !== 'string' ||
      !snapshot.currentArtistId ||
      !guess.trim() ||
      Array.from(guess).length > 60
    ) {
      this.clear();
      return false;
    }

    return this.write({
      version: TURN_DRAFT_VERSION,
      roomCode: snapshot.roomCode,
      clientId,
      phase: 'guessing',
      turnToken: snapshot.turnToken,
      timestamp: this.now(),
      currentArtistId: snapshot.currentArtistId,
      guess
    });
  }

  restore(snapshot: RoomSnapshot, clientId: string): TurnDraft | null {
    const draft = this.read();
    if (!draft) {
      return null;
    }

    if (
      draft.roomCode !== snapshot.roomCode ||
      draft.clientId !== clientId ||
      draft.phase !== snapshot.phase ||
      draft.turnToken !== snapshot.turnToken ||
      !canDraft(snapshot, clientId)
    ) {
      this.clear();
      return null;
    }

    if (draft.phase === 'drawing') {
      if (snapshot.drawingSubmittedIds.includes(clientId)) {
        this.clear();
        return null;
      }
      return draft;
    }

    if (
      snapshot.guessSubmittedIds.includes(clientId) ||
      snapshot.currentArtistId !== draft.currentArtistId
    ) {
      this.clear();
      return null;
    }
    return draft;
  }

  clear(): void {
    try {
      this.storage?.removeItem(TURN_DRAFT_STORAGE_KEY);
    } catch {
      // Draft recovery is optional when session storage is unavailable.
    }
  }

  private read(): TurnDraft | null {
    let serialized: string | null;
    try {
      serialized = this.storage?.getItem(TURN_DRAFT_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
    if (!serialized) {
      return null;
    }
    if (serializedBytes(serialized) > MAX_TURN_DRAFT_BYTES) {
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

    const draft = parseTurnDraft(parsed);
    const now = this.now();
    if (
      !draft ||
      !Number.isFinite(now) ||
      draft.timestamp > now ||
      now - draft.timestamp > TURN_DRAFT_TTL_MS
    ) {
      this.clear();
      return null;
    }
    return draft;
  }

  private write(draft: TurnDraft): boolean {
    let serialized: string;
    try {
      serialized = JSON.stringify(draft);
    } catch {
      this.clear();
      return false;
    }
    if (serializedBytes(serialized) > MAX_TURN_DRAFT_BYTES) {
      this.clear();
      return false;
    }
    try {
      this.storage?.setItem(TURN_DRAFT_STORAGE_KEY, serialized);
      return this.storage !== null;
    } catch {
      return false;
    }
  }
}

const browserTurnDraftCache = new TurnDraftCache();

/** Reconciles the single tab draft without exposing or restoring its payload. */
export function reconcileTurnDraft(snapshot: RoomSnapshot, clientId: string): void {
  browserTurnDraftCache.restore(snapshot, clientId);
}

/** Clears the current tab's optional draft during an explicit room/session exit. */
export function clearTurnDraft(): void {
  browserTurnDraftCache.clear();
}

function canDraft(snapshot: RoomSnapshot, clientId: string): boolean {
  const self = snapshot.players.find((player) => player.id === clientId);
  return Boolean(self?.connected && !self.spectator && playerNeedsAction(snapshot, clientId));
}

function parseTurnDraft(value: unknown): TurnDraft | null {
  if (!isRecord(value) || !isValidBase(value)) {
    return null;
  }

  if (value.phase === 'drawing') {
    const drawing = cloneValidDrawing(value.drawing);
    if (!drawing || drawing.strokes.length === 0) {
      return null;
    }
    return {
      version: TURN_DRAFT_VERSION,
      roomCode: value.roomCode,
      clientId: value.clientId,
      phase: 'drawing',
      turnToken: value.turnToken,
      timestamp: value.timestamp,
      drawing
    };
  }

  if (
    value.phase !== 'guessing' ||
    typeof value.currentArtistId !== 'string' ||
    !value.currentArtistId ||
    typeof value.guess !== 'string' ||
    !value.guess.trim() ||
    Array.from(value.guess).length > 60
  ) {
    return null;
  }
  return {
    version: TURN_DRAFT_VERSION,
    roomCode: value.roomCode,
    clientId: value.clientId,
    phase: 'guessing',
    turnToken: value.turnToken,
    timestamp: value.timestamp,
    currentArtistId: value.currentArtistId,
    guess: value.guess
  };
}

function isValidBase(value: Record<string, unknown>): value is Record<string, unknown> & TurnDraftBase {
  return (
    value.version === TURN_DRAFT_VERSION &&
    typeof value.roomCode === 'string' &&
    /^[A-Z0-9]{4}$/.test(value.roomCode) &&
    typeof value.clientId === 'string' &&
    Boolean(value.clientId) &&
    typeof value.turnToken === 'number' &&
    Number.isSafeInteger(value.turnToken) &&
    value.turnToken >= 0 &&
    typeof value.timestamp === 'number' &&
    Number.isSafeInteger(value.timestamp) &&
    value.timestamp >= 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function serializedBytes(value: string): number {
  return new Blob([value]).size;
}
