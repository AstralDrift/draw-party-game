/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot, type ServerMessage } from '../protocol';
import { resetServerClock } from '../time';
import { GameProvider } from './GameProvider';

interface SocketCallbacks {
  onMessage: (message: ServerMessage) => void;
}

const harness = vi.hoisted(() => ({
  socketCallbacks: [] as unknown[],
  playCue: vi.fn()
}));

vi.mock('../net', () => ({
  GameSocket: class {
    constructor(callbacks: unknown) {
      harness.socketCallbacks.push(callbacks);
    }

    connect(): void {}
    close(): void {}
    isOpen(): boolean {
      return true;
    }
    send(): boolean {
      return true;
    }
  }
}));

vi.mock('../sound', () => ({
  playCue: harness.playCue,
  setSoundEnabled: vi.fn(),
  setSoundScope: vi.fn(),
  soundEnabled: () => true
}));

function snapshot(overrides: Partial<RoomSnapshot>): RoomSnapshot {
  return {
    roomCode: 'ABCD',
    phase: 'lobby',
    players: [],
    minPlayers: 1,
    maxPlayers: 8,
    currentRound: 1,
    totalRounds: 1,
    settings: defaultRoomSettings(),
    turnToken: 1,
    serverNowMs: 1_000,
    gameMode: 'party',
    deadlineExtensionAvailable: false,
    deadlineMs: null,
    currentArtistId: null,
    currentArtistName: null,
    currentDrawing: null,
    votingOptions: [],
    roundResult: null,
    finalScores: [],
    drawingSubmittedIds: [],
    guessSubmittedIds: [],
    voteSubmittedIds: [],
    ...overrides
  };
}

describe('display deadline cues', () => {
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    resetServerClock();
    localStorage.clear();
    sessionStorage.clear();
    window.name = '';
    window.history.replaceState(null, '', '/');
    harness.socketCallbacks.length = 0;
    harness.playCue.mockClear();

    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(GameProvider, null, createElement('span'))));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('keeps the finale replay-unlock silent without suppressing real countdown ticks', () => {
    const socket = harness.socketCallbacks.at(-1) as SocketCallbacks;

    act(() => {
      socket.onMessage({
        type: 'roomSnapshot',
        snapshot: snapshot({ phase: 'finalScores', deadlineMs: 4_000 })
      });
    });

    expect(harness.playCue).not.toHaveBeenCalledWith('tick');

    harness.playCue.mockClear();
    act(() => {
      socket.onMessage({
        type: 'phaseChanged',
        snapshot: snapshot({ phase: 'drawing', turnToken: 2, deadlineMs: 4_000 })
      });
    });

    expect(harness.playCue).toHaveBeenCalledWith('tick');
  });
});
