/**
 * @vitest-environment happy-dom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot } from '../../protocol';

const useGameMock = vi.hoisted(() => vi.fn());

vi.mock('../../app/GameProvider', () => ({
  useGame: useGameMock
}));

import { HostTimeExtension } from './HostTimeExtension';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true
});

function drawingSnapshot(): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'drawing',
    gameMode: 'party',
    players: [
      {
        id: 'host',
        name: 'Ada',
        score: 0,
        connected: true,
        spectator: false,
        isHost: true
      }
    ],
    minPlayers: 3,
    maxPlayers: 8,
    settings: defaultRoomSettings(),
    serverNowMs: 100,
    currentRound: 1,
    totalRounds: 2,
    turnToken: 42,
    deadlineMs: 75_100,
    deadlineExtensionAvailable: true,
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

describe('HostTimeExtension', () => {
  it('sends the current snapshot turn token with the extension request', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const clearError = vi.fn();
    const send = vi.fn(() => true);
    useGameMock.mockReturnValue({
      snapshot: drawingSnapshot(),
      clientId: 'host',
      status: 'connected',
      errorMessage: '',
      clearError,
      send
    });

    try {
      act(() => root.render(<HostTimeExtension />));
      const button = container.querySelector('button');
      if (!button) {
        throw new Error('Expected the host time extension button');
      }

      act(() => button.click());

      expect(clearError).toHaveBeenCalledOnce();
      expect(send).toHaveBeenCalledWith({
        type: 'extendDeadline',
        turnToken: 42
      });
    } finally {
      act(() => root.unmount());
    }
  });
});
