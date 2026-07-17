import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot } from './protocol';
import { formatDeadline, nowMs, syncServerClock } from './time';

function snapshot(serverNowMs: number, deadlineMs: number | null): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'drawing',
    players: [],
    minPlayers: 1,
    maxPlayers: 8,
    currentRound: 1,
    totalRounds: 5,
    settings: defaultRoomSettings(),
    turnToken: 1,
    serverNowMs,
    deadlineMs,
    currentArtistId: null,
    currentArtistName: null,
    currentDrawing: null,
    votingOptions: [],
    roundResult: null,
    finalScores: [],
    drawingSubmittedIds: [],
    guessSubmittedIds: [],
    voteSubmittedIds: []
  };
}

describe('deadline formatting', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses server clock offset instead of raw local time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    syncServerClock(snapshot(10_000, 70_000));

    expect(formatDeadline(snapshot(10_000, 70_000))).toBe('1:00');
    expect(nowMs()).toBe(10_000);
  });

  it('returns empty labels without a usable deadline and floors expired clocks', () => {
    expect(formatDeadline(snapshot(10_000, null))).toBe('');
    expect(formatDeadline(null)).toBe('');
    // deadlineMs 0 is falsy and intentionally treated as "no deadline".
    expect(formatDeadline(snapshot(10_000, 0))).toBe('');

    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    syncServerClock(snapshot(10_000, 10_000));
    expect(formatDeadline(snapshot(10_000, 10_000))).toBe('0:00');
    expect(formatDeadline(snapshot(10_000, 9_000))).toBe('0:00');
  });

  it('ceils fractional remaining seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    syncServerClock(snapshot(10_000, 10_500));
    expect(formatDeadline(snapshot(10_000, 10_500))).toBe('0:01');
    syncServerClock(snapshot(10_000, 11_001));
    expect(formatDeadline(snapshot(10_000, 11_001))).toBe('0:02');
  });
});
