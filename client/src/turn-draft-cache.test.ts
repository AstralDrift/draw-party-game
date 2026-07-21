import { describe, expect, it } from 'vitest';
import { createEmptyDrawing, drawingTestExports } from './drawing';
import { defaultRoomSettings, type DrawingDoc, type RoomSnapshot } from './protocol';
import {
  MAX_TURN_DRAFT_BYTES,
  TURN_DRAFT_STORAGE_KEY,
  TURN_DRAFT_TTL_MS,
  TURN_DRAFT_VERSION,
  TurnDraftCache
} from './turn-draft-cache';

function snapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'drawing',
    gameMode: 'party',
    players: [
      {
        id: 'p1',
        name: 'Ava',
        score: 0,
        connected: true,
        spectator: false,
        isHost: true
      },
      {
        id: 'p2',
        name: 'Bo',
        score: 0,
        connected: true,
        spectator: false,
        isHost: false
      }
    ],
    minPlayers: 3,
    maxPlayers: 8,
    currentRound: 1,
    totalRounds: 2,
    settings: defaultRoomSettings(),
    turnToken: 3,
    serverNowMs: 1000,
    deadlineMs: 61_000,
    currentArtistId: null,
    currentArtistName: null,
    currentDrawing: null,
    votingOptions: [],
    roundResult: null,
    finalScores: [],
    drawingSubmittedIds: [],
    guessSubmittedIds: [],
    voteSubmittedIds: [],
    ...overrides
  };
}

function drawing(): DrawingDoc {
  return {
    width: 1024,
    height: 768,
    strokes: [
      {
        color: '#111111',
        size: 6,
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 }
        ]
      }
    ]
  };
}

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(TURN_DRAFT_STORAGE_KEY, initial);
  }
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

describe('TurnDraftCache', () => {
  it('round-trips a versioned identity-bound drawing as a defensive clone', () => {
    const storage = memoryStorage();
    const cache = new TurnDraftCache(storage, () => 10_000);
    const source = drawing();

    expect(cache.saveDrawing(snapshot(), 'p1', source)).toBe(true);
    const persisted = JSON.parse(storage.values.get(TURN_DRAFT_STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    expect(persisted).toMatchObject({
      version: TURN_DRAFT_VERSION,
      roomCode: 'ABCD',
      clientId: 'p1',
      phase: 'drawing',
      turnToken: 3,
      timestamp: 10_000
    });

    source.strokes[0]!.points[0]!.x = 500;
    const restored = cache.restore(snapshot(), 'p1');
    expect(restored?.phase).toBe('drawing');
    if (restored?.phase !== 'drawing') throw new Error('expected a drawing draft');
    expect(restored.drawing.strokes[0]?.points[0]?.x).toBe(1);

    restored.drawing.strokes[0]!.points[0]!.x = 700;
    const restoredAgain = cache.restore(snapshot(), 'p1');
    expect(restoredAgain?.phase === 'drawing' ? restoredAgain.drawing.strokes[0]?.points[0]?.x : null).toBe(1);
  });

  it('restores a fake title only for the same artist and preserves the exact draft text', () => {
    const storage = memoryStorage();
    const cache = new TurnDraftCache(storage, () => 10_000);
    const guessing = snapshot({ phase: 'guessing', currentArtistId: 'p2' });

    expect(cache.saveGuess(guessing, 'p1', '  plausible moon dentist  ')).toBe(true);
    expect(cache.restore(guessing, 'p1')).toMatchObject({
      phase: 'guessing',
      currentArtistId: 'p2',
      guess: '  plausible moon dentist  '
    });

    expect(
      cache.restore(snapshot({ phase: 'guessing', currentArtistId: 'p3' }), 'p1')
    ).toBeNull();
    expect(storage.values.has(TURN_DRAFT_STORAGE_KEY)).toBe(false);
  });

  it('clears on room, client, phase, or turn mismatch', () => {
    const mismatches: Array<[Partial<RoomSnapshot>, string]> = [
      [{ roomCode: 'WXYZ' }, 'p1'],
      [{}, 'p2'],
      [{ phase: 'guessing', currentArtistId: 'p2' }, 'p1'],
      [{ turnToken: 4 }, 'p1']
    ];

    for (const [overrides, clientId] of mismatches) {
      const storage = memoryStorage();
      const cache = new TurnDraftCache(storage, () => 10_000);
      expect(cache.saveDrawing(snapshot(), 'p1', drawing())).toBe(true);
      expect(cache.restore(snapshot(overrides), clientId)).toBeNull();
      expect(storage.values.has(TURN_DRAFT_STORAGE_KEY)).toBe(false);
    }
  });

  it('restores only while self is connected, active, needs action, and is unsubmitted', () => {
    const ineligibleSnapshots = [
      snapshot({ drawingSubmittedIds: ['p1'] }),
      snapshot({ players: [{ ...snapshot().players[0]!, connected: false }] }),
      snapshot({ players: [{ ...snapshot().players[0]!, spectator: true }] })
    ];

    for (const next of ineligibleSnapshots) {
      const storage = memoryStorage();
      const cache = new TurnDraftCache(storage, () => 10_000);
      cache.saveDrawing(snapshot(), 'p1', drawing());
      expect(cache.restore(next, 'p1')).toBeNull();
      expect(storage.values.has(TURN_DRAFT_STORAGE_KEY)).toBe(false);
    }

    const storage = memoryStorage();
    const cache = new TurnDraftCache(storage, () => 10_000);
    const guessing = snapshot({ phase: 'guessing', currentArtistId: 'p2' });
    cache.saveGuess(guessing, 'p1', 'fake');
    expect(cache.restore({ ...guessing, guessSubmittedIds: ['p1'] }, 'p1')).toBeNull();
  });

  it('clears explicit empty drafts and rejects guesses beyond 60 characters', () => {
    const storage = memoryStorage();
    const cache = new TurnDraftCache(storage, () => 10_000);

    cache.saveDrawing(snapshot(), 'p1', drawing());
    expect(cache.saveDrawing(snapshot(), 'p1', createEmptyDrawing())).toBe(false);
    expect(storage.values.has(TURN_DRAFT_STORAGE_KEY)).toBe(false);

    const guessing = snapshot({ phase: 'guessing', currentArtistId: 'p2' });
    cache.saveGuess(guessing, 'p1', 'fake');
    expect(cache.saveGuess(guessing, 'p1', '   ')).toBe(false);
    expect(storage.values.has(TURN_DRAFT_STORAGE_KEY)).toBe(false);
    expect(cache.saveGuess(guessing, 'p1', 'x'.repeat(61))).toBe(false);
    expect(cache.saveGuess(guessing, 'p1', 'x'.repeat(60))).toBe(true);
  });

  it('clears malformed, expired, future, oversized, and vote-shaped records', () => {
    const malformedRecords = [
      '{not json',
      JSON.stringify({ version: TURN_DRAFT_VERSION, phase: 'voting', optionId: 'option-1' }),
      JSON.stringify({
        version: TURN_DRAFT_VERSION,
        roomCode: 'ABCD',
        clientId: 'p1',
        phase: 'drawing',
        turnToken: 3,
        timestamp: 10_000,
        drawing: { ...drawing(), width: 1 }
      }),
      'x'.repeat(MAX_TURN_DRAFT_BYTES + 1)
    ];

    for (const serialized of malformedRecords) {
      const storage = memoryStorage(serialized);
      const cache = new TurnDraftCache(storage, () => 10_000);
      expect(cache.restore(snapshot(), 'p1')).toBeNull();
      expect(storage.values.has(TURN_DRAFT_STORAGE_KEY)).toBe(false);
    }

    const now = 1_000_000;
    for (const timestamp of [now - TURN_DRAFT_TTL_MS - 1, now + 1]) {
      const storage = memoryStorage(
        JSON.stringify({
          version: TURN_DRAFT_VERSION,
          roomCode: 'ABCD',
          clientId: 'p1',
          phase: 'drawing',
          turnToken: 3,
          timestamp,
          drawing: drawing()
        })
      );
      const cache = new TurnDraftCache(storage, () => now);
      expect(cache.restore(snapshot(), 'p1')).toBeNull();
      expect(storage.values.has(TURN_DRAFT_STORAGE_KEY)).toBe(false);
    }
  });

  it('keeps a maximum valid drawing record below the one-record budget', () => {
    const maximum = createEmptyDrawing();
    for (let strokeIndex = 0; strokeIndex < drawingTestExports.MAX_STROKES; strokeIndex += 1) {
      maximum.strokes.push({
        color: '#111111',
        size: 6,
        points: Array.from({ length: drawingTestExports.MAX_POINTS_PER_STROKE }, (_, pointIndex) => ({
          x: pointIndex,
          y: strokeIndex
        }))
      });
    }
    const storage = memoryStorage();
    const cache = new TurnDraftCache(storage, () => 10_000);

    expect(cache.saveDrawing(snapshot(), 'p1', maximum)).toBe(true);
    expect(new Blob([storage.values.get(TURN_DRAFT_STORAGE_KEY) ?? '']).size).toBeLessThanOrEqual(
      MAX_TURN_DRAFT_BYTES
    );
  });

  it('treats blocked storage as a non-fatal loss of optional recovery', () => {
    const blocked = {
      getItem(): never {
        throw new Error('blocked');
      },
      setItem(): never {
        throw new Error('blocked');
      },
      removeItem(): never {
        throw new Error('blocked');
      }
    };
    const cache = new TurnDraftCache(blocked, () => 10_000);

    expect(cache.saveDrawing(snapshot(), 'p1', drawing())).toBe(false);
    expect(cache.restore(snapshot(), 'p1')).toBeNull();
    expect(() => cache.clear()).not.toThrow();
  });
});
