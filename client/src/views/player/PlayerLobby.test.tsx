import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot } from '../../protocol';

const useGameMock = vi.hoisted(() => vi.fn());

vi.mock('../../app/GameProvider', () => ({
  useGame: useGameMock
}));

import { PlayerLobby } from './PlayerLobby';

function lobbySnapshot(playerCount: number): RoomSnapshot {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    id: index === 0 ? 'host' : `player-${index}`,
    name: index === 0 ? 'Ada' : `P${index}`,
    score: 0,
    connected: true,
    spectator: false,
    isHost: index === 0
  }));
  return {
    roomCode: 'ABCD',
    phase: 'lobby',
    gameMode: 'party',
    players,
    minPlayers: 3,
    maxPlayers: 8,
    settings: defaultRoomSettings(),
    serverNowMs: 100,
    currentRound: 0,
    totalRounds: 3,
    turnToken: 0,
    deadlineMs: 0,
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

function renderLobby(clientId: string, playerCount: number): string {
  useGameMock.mockReturnValue({
    role: 'player',
    snapshot: lobbySnapshot(playerCount),
    clientId,
    soundOn: true,
    setName: vi.fn(),
    send: vi.fn(),
    updateSettings: vi.fn(),
    toggleSound: vi.fn()
  });
  return renderToStaticMarkup(<PlayerLobby />);
}

describe('PlayerLobby', () => {
  it('keeps the seating count on the host phone', () => {
    const markup = renderLobby('host', 2);
    expect(markup).toContain('player-ready-meter');
    expect(markup).toContain('Need 1 more player.');
    expect(markup).toContain('Start Party');
    expect(markup).toContain('aria-label="Turn alerts off"');
  });

  it('leaves non-host phones on Watch the TV', () => {
    const markup = renderLobby('player-1', 2);
    expect(markup).toContain('Watch the TV.');
    expect(markup).not.toContain('player-ready-meter');
    expect(markup).not.toContain('Need 1 more player.');
    expect(markup).not.toContain('Start Party');
  });

  it('tells lobby spectators to watch the TV without a Spectating pill', () => {
    const snapshot = lobbySnapshot(3);
    snapshot.players[2] = { ...snapshot.players[2], spectator: true };
    useGameMock.mockReturnValue({
      role: 'player',
      snapshot,
      clientId: 'player-2',
      soundOn: true,
      setName: vi.fn(),
      send: vi.fn(),
      updateSettings: vi.fn(),
      toggleSound: vi.fn()
    });
    const markup = renderToStaticMarkup(<PlayerLobby />);
    expect(markup).toContain('Watch the TV.');
    expect(markup).toContain('aria-label="Spectating. Watch the TV. You play next round."');
    expect(markup).not.toContain('spectator-pill');
    expect(markup).not.toContain('>You play next round.<');
    expect(markup).not.toContain('Start Party');
  });
});
