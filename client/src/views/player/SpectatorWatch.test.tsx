import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot } from '../../protocol';

const useGameMock = vi.hoisted(() => vi.fn());

vi.mock('../../app/GameProvider', () => ({
  useGame: useGameMock
}));

import { SpectatorDrawing } from './SpectatorWatch';

function drawingSnapshot(): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'drawing',
    gameMode: 'party',
    players: [
      {
        id: 'host',
        name: 'Ava',
        score: 0,
        connected: true,
        spectator: false,
        isHost: true
      },
      {
        id: 'late',
        name: 'Late',
        score: 0,
        connected: true,
        spectator: true,
        isHost: false
      }
    ],
    minPlayers: 3,
    maxPlayers: 8,
    settings: defaultRoomSettings(),
    serverNowMs: 100,
    currentRound: 1,
    totalRounds: 2,
    turnToken: 1,
    deadlineMs: 20_100,
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

describe('SpectatorDrawing', () => {
  it('looks up without a Spectating banner or next-round coach line', () => {
    useGameMock.mockReturnValue({
      role: 'player',
      snapshot: drawingSnapshot(),
      clientId: 'late',
      status: 'Connected',
      errorMessage: '',
      pendingJoin: null,
      pendingSubmission: null,
      deadlineLabel: '20',
      deadlineUrgent: false,
      reactionBursts: [],
      submitAction: vi.fn(),
      setErrorMessage: vi.fn(),
      clearError: vi.fn(),
      send: vi.fn(() => true),
      haptic: vi.fn()
    });

    const markup = renderToStaticMarkup(<SpectatorDrawing />);

    expect(markup).toContain('Look up');
    expect(markup).toContain('aria-label="Spectating. Look up. You play next round."');
    expect(markup).not.toContain('spectator-banner');
    expect(markup).not.toContain('spectator-pill');
    expect(markup).not.toContain('>You play next round.<');
  });
});
