import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot } from '../../protocol';

const useGameMock = vi.hoisted(() => vi.fn());

vi.mock('../../app/GameProvider', () => ({
  useGame: useGameMock
}));

import { PlayerVoting } from './PlayerPlay';

function nailedItSnapshot(): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'voting',
    gameMode: 'party',
    players: [
      {
        id: 'artist',
        name: 'Ada',
        score: 0,
        connected: true,
        spectator: false,
        isHost: true
      },
      {
        id: 'player',
        name: 'Grace',
        score: 0,
        connected: true,
        spectator: false,
        isHost: false
      }
    ],
    minPlayers: 3,
    maxPlayers: 8,
    settings: defaultRoomSettings(),
    serverNowMs: 100,
    currentRound: 1,
    totalRounds: 2,
    turnToken: 3,
    deadlineMs: 20_100,
    deadlineExtensionAvailable: true,
    currentArtistId: 'artist',
    currentArtistName: 'Ada',
    currentDrawing: null,
    votingOptions: [
      { id: 'option-0', text: 'A fake', isCorrect: false },
      { id: 'option-1', text: 'The truth', isCorrect: false }
    ],
    nailedIt: true,
    roundResult: null,
    finalScores: [],
    drawingSubmittedIds: ['artist', 'player'],
    guessSubmittedIds: ['player'],
    voteSubmittedIds: ['player']
  };
}

describe('PlayerVoting', () => {
  it('shows the private nailed-it acknowledgement instead of voting controls', () => {
    useGameMock.mockReturnValue({
      role: 'player',
      snapshot: nailedItSnapshot(),
      clientId: 'player',
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

    const markup = renderToStaticMarkup(<PlayerVoting />);

    expect(markup).toContain('Nailed it — correct vote locked.');
    expect(markup).not.toContain('class="vote-list');
    expect(markup).not.toContain('Vote locked!');
  });
});
