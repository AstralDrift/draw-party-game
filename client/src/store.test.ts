import { describe, expect, it } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot } from './protocol';
import { viewKeyFor } from './store';

function snapshot(): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'lobby',
    players: [{ id: 'p1', name: 'Ava', score: 0, connected: true }],
    minPlayers: 1,
    maxPlayers: 8,
    currentRound: 0,
    totalRounds: 5,
    settings: defaultRoomSettings(),
    turnToken: 0,
    serverNowMs: 100,
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
  };
}

describe('viewKeyFor', () => {
  it('includes pending join state before snapshots arrive', () => {
    expect(
      viewKeyFor({
        role: 'player',
        clientId: 'p1',
        initialRoomCode: 'ABCD',
        pendingRoomCode: 'WXYZ',
        snapshot: null
      })
    ).toBe('player:join:WXYZ');
  });

  it('changes when lobby players or settings change', () => {
    const first = snapshot();
    const second = snapshot();
    second.settings.drawSeconds = 120;
    second.players.push({ id: 'p2', name: 'Bo', score: 0, connected: true });

    expect(viewKeyFor({ role: 'display', clientId: 'tv', initialRoomCode: '', snapshot: first })).not.toBe(
      viewKeyFor({ role: 'display', clientId: 'tv', initialRoomCode: '', snapshot: second })
    );
  });
});
