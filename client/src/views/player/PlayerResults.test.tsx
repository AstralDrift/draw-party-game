import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot, type RoundResult } from '../../protocol';
import type { RevealStage } from '../../hooks/useRevealStage';

const useGameMock = vi.hoisted(() => vi.fn());
const useRevealStageMock = vi.hoisted(() => vi.fn());

vi.mock('../../app/GameProvider', () => ({
  useGame: useGameMock
}));

vi.mock('../../hooks/useRevealStage', () => ({
  useRevealStage: useRevealStageMock
}));

import { PlayerResults } from './PlayerResults';

function result(): RoundResult {
  return {
    artistId: 'artist',
    artistName: 'Ada',
    correctAnswer: 'A lighthouse',
    correctVoterNames: ['Grace'],
    breakdown: [],
    scoreDeltas: [{ playerId: 'player', name: 'Grace', delta: 100, scoreAfter: 100 }],
    scoreEvents: [
      {
        kind: 'foundTruth',
        playerId: 'player',
        name: 'Grace',
        points: 100,
        relatedPlayerId: null,
        relatedPlayerName: null
      }
    ],
    nobodyFoundIt: false,
    perfectTruth: false
  };
}

function resultsSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'results',
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
        score: 100,
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
    currentArtistId: 'artist',
    currentArtistName: 'Ada',
    currentDrawing: null,
    votingOptions: [],
    roundResult: result(),
    finalScores: [],
    drawingSubmittedIds: ['artist', 'player'],
    guessSubmittedIds: ['player'],
    voteSubmittedIds: ['player'],
    ...overrides
  };
}

function renderResults(stage: RevealStage, snapshot: RoomSnapshot = resultsSnapshot(), clientId = 'player') {
  useRevealStageMock.mockReturnValue({ stage, complete: stage === 'complete' });
  useGameMock.mockReturnValue({
    role: 'player',
    snapshot,
    clientId,
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
  return renderToStaticMarkup(<PlayerResults />);
}

describe('PlayerResults', () => {
  it('keeps the phone on Look up through the TV punchline', () => {
    for (const stage of ['hold', 'tally', 'correct', 'deltas'] as const) {
      const markup = renderResults(stage);
      expect(markup).toContain('Look up');
      expect(markup).not.toContain('personal-score');
      expect(markup).not.toContain('found the truth');
      expect(markup).not.toContain('No points this reveal');
      expect(markup).not.toContain('Practice · scores off');
    }
  });

  it('shows personal points only after the punchline, and never paints a no-points line', () => {
    const scored = renderResults('complete');
    expect(scored).toContain('Look up');
    expect(scored).toContain('personal-score');
    expect(scored).toContain('found the truth');

    const unscored = renderResults('complete', {
      ...resultsSnapshot(),
      roundResult: {
        ...result(),
        scoreDeltas: [{ playerId: 'player', name: 'Grace', delta: 0, scoreAfter: 0 }],
        scoreEvents: []
      }
    });
    expect(unscored).toContain('Look up');
    expect(unscored).not.toContain('personal-score');
    expect(unscored).not.toContain('No points this reveal');
  });

  it('gives the host Continue without a second clock', () => {
    const markup = renderResults('complete', resultsSnapshot(), 'artist');
    expect(markup).toContain('Continue');
    expect(markup).toContain('result-phone-advance');
    expect(markup).not.toContain('id="deadline-text"');
  });
});
