import { describe, expect, it } from 'vitest';
import { defaultRoomSettings, isServerMessage, phaseLabel } from './protocol';

describe('protocol helpers', () => {
  it('recognizes valid server messages', () => {
    expect(isServerMessage({ type: 'pong', nowMs: 123 })).toBe(true);
    expect(
      isServerMessage({
        type: 'roomSnapshot',
        snapshot: {
          roomCode: 'ABCD',
          phase: 'lobby',
          players: [],
          minPlayers: 2,
          maxPlayers: 8,
          currentRound: 0,
          totalRounds: 5,
          settings: defaultRoomSettings(),
          turnToken: 0,
          serverNowMs: 123,
          deadlineMs: null,
          currentArtistId: null,
          currentArtistName: null,
          currentDrawing: null,
          votingOptions: [],
          roundResult: null,
          finalScores: [],
          drawingSubmittedIds: [],
          guessSubmittedIds: [],
          voteSubmittedIds: []
        }
      })
    ).toBe(true);
  });

  it('rejects malformed server messages', () => {
    expect(isServerMessage({ type: 'pong', nowMs: '123' })).toBe(false);
    expect(isServerMessage({ type: 'roomSnapshot', snapshot: { phase: 'lobby' } })).toBe(false);
    expect(isServerMessage({ type: 'unknown' })).toBe(false);
    expect(isServerMessage({ nowMs: 123 })).toBe(false);
    expect(isServerMessage(null)).toBe(false);
  });

  it('labels phases for UI chrome', () => {
    expect(phaseLabel('finalScores')).toBe('Final Scores');
    expect(phaseLabel('drawing')).toBe('Drawing');
  });
});
