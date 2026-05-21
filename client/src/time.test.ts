import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot } from './protocol';
import { formatDeadline, syncServerClock } from './time';

function snapshot(serverNowMs: number, deadlineMs: number | null): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'drawing',
    players: [],
    minPlayers: 2,
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
  });

  it('returns an empty label without a deadline', () => {
    expect(formatDeadline(snapshot(10_000, null))).toBe('');
  });
});
