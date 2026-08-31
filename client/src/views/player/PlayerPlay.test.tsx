import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot } from '../../protocol';

const useGameMock = vi.hoisted(() => vi.fn());

vi.mock('../../app/GameProvider', () => ({
  useGame: useGameMock
}));

import { PlayerGuessing, PlayerVoting } from './PlayerPlay';

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

function votingSnapshot(): RoomSnapshot {
  return {
    ...nailedItSnapshot(),
    nailedIt: false,
    voteSubmittedIds: [],
    votingOptions: [
      { id: 'option-0', text: 'A fake', isCorrect: false, authorPlayerId: 'player' },
      { id: 'option-1', text: 'The truth', isCorrect: true }
    ]
  };
}

function votingHostSnapshot(): RoomSnapshot {
  return {
    ...votingSnapshot(),
    players: [
      {
        id: 'artist',
        name: 'Ada',
        score: 0,
        connected: true,
        spectator: false,
        isHost: false
      },
      {
        id: 'player',
        name: 'Grace',
        score: 0,
        connected: true,
        spectator: false,
        isHost: true
      }
    ]
  };
}

function gameMock(snapshot: RoomSnapshot, clientId: string) {
  return {
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
  };
}

describe('PlayerVoting', () => {
  it('looks up instead of showing a vote list when the guess nailed the prompt', () => {
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

    expect(markup).toContain('Look up');
    expect(markup).not.toContain('id="deadline-text"');
    expect(markup).not.toContain('class="vote-list');
    expect(markup).not.toContain('Vote locked!');
    expect(markup).not.toContain('the correct vote is locked');
  });

  it('marks the player own letter as Yours without a tappable dead button', () => {
    useGameMock.mockReturnValue({
      role: 'player',
      snapshot: votingSnapshot(),
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

    expect(markup).toContain('is-own');
    expect(markup).toContain('>Yours</span>');
    expect(markup).toContain('Your fake answer');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('id="deadline-text"');
  });

  it('hides the letter grid once a vote is locked', () => {
    useGameMock.mockReturnValue({
      role: 'player',
      snapshot: { ...votingSnapshot(), voteSubmittedIds: ['player'] },
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

    expect(markup).toContain('Watch the TV.');
    expect(markup).not.toContain('player-vote-list');
    expect(markup).not.toContain('Your vote');
  });

  it('keeps host +30 off the letter grid until the vote locks', () => {
    useGameMock.mockReturnValue(gameMock(votingHostSnapshot(), 'player'));

    const markup = renderToStaticMarkup(<PlayerVoting />);

    expect(markup).toContain('player-vote-list');
    expect(markup).not.toContain('aria-label="+30 seconds"');
  });

  it('returns host +30 after the vote locks', () => {
    useGameMock.mockReturnValue(
      gameMock({ ...votingHostSnapshot(), voteSubmittedIds: ['player'] }, 'player')
    );

    const markup = renderToStaticMarkup(<PlayerVoting />);

    expect(markup).toContain('Watch the TV.');
    expect(markup).toContain('aria-label="+30 seconds"');
  });
});

describe('PlayerGuessing', () => {
  it('keeps host +30 off the title field until the fake locks', () => {
    useGameMock.mockReturnValue(
      gameMock(
        {
          ...votingHostSnapshot(),
          phase: 'guessing',
          currentArtistId: 'artist',
          guessSubmittedIds: [],
          voteSubmittedIds: [],
          votingOptions: []
        },
        'player'
      )
    );

    const markup = renderToStaticMarkup(<PlayerGuessing />);

    expect(markup).toContain('Something that sounds legit');
    expect(markup).toContain('autofocus');
    expect(markup).not.toContain('aria-label="+30 seconds"');
  });
});
