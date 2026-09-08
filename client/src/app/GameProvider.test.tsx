/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultRoomSettings, type RoomSnapshot, type ServerMessage } from '../protocol';
import { resetServerClock } from '../time';
import { TurnDraftCache } from '../turn-draft-cache';
import { PENDING_RENAME_STORAGE_KEY } from '../pending-rename-cache';
import { GameProvider, useGame } from './GameProvider';

interface SocketCallbacks {
  clientId: string;
  sessionToken: string;
  onOpen: () => void;
  onClose: () => void;
  onStatus: (status: string) => void;
  onMessage: (message: ServerMessage) => void;
}

const harness = vi.hoisted(() => ({
  socketCallbacks: [] as unknown[],
  sockets: [] as Array<{ close: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> }>,
  playCue: vi.fn(),
  setSoundPhase: vi.fn(),
  stopSound: vi.fn()
}));

vi.mock('../net', () => ({
  GameSocket: class {
    constructor(callbacks: unknown) {
      harness.socketCallbacks.push(callbacks);
      harness.sockets.push(this);
    }

    connect(): void {}
    close = vi.fn();
    send = vi.fn(() => true);
    isOpen(): boolean {
      return true;
    }
  }
}));

vi.mock('../sound', () => ({
  playCue: harness.playCue,
  setSoundEnabled: vi.fn(),
  setSoundMode: vi.fn(),
  soundMode: () => 'effects',
  setSoundPhase: harness.setSoundPhase,
  stopSound: harness.stopSound,
  unlockSound: vi.fn(),
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

describe('display sound and connection state', () => {
  let root: Root;
  let game: ReturnType<typeof useGame>;

  function ReadGame() {
    game = useGame();
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    resetServerClock();
    localStorage.clear();
    sessionStorage.clear();
    window.name = '';
    window.history.replaceState(null, '', '/');
    harness.socketCallbacks.length = 0;
    harness.sockets.length = 0;
    harness.playCue.mockClear();
    harness.setSoundPhase.mockClear();
    harness.stopSound.mockClear();

    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(GameProvider, null, createElement(ReadGame))));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it.each(['session_in_use', 'invalid_player_session'])('disconnects and stops display audio for terminal %s errors', (code) => {
    const socket = harness.socketCallbacks.at(-1) as SocketCallbacks;
    act(() => {
      socket.onStatus('Connected');
      socket.onMessage({ type: 'roomSnapshot', snapshot: snapshot({}) });
    });
    expect(game.status).toBe('Connected');
    expect(harness.setSoundPhase).toHaveBeenLastCalledWith('lobby');
    harness.stopSound.mockClear();

    act(() => socket.onMessage({ type: 'error', code, message: 'Session rejected' }));
    expect(game.status).toBe('Disconnected');
    expect(game.snapshot?.roomCode).toBe('ABCD');
    expect(harness.sockets[0].close).toHaveBeenCalledOnce();
    expect(harness.setSoundPhase).toHaveBeenLastCalledWith(null);
    expect(harness.stopSound).toHaveBeenCalledOnce();

    act(() => {
      socket.onStatus('Connected');
      socket.onClose();
      vi.advanceTimersByTime(5_000);
    });
    expect(game.status).toBe('Disconnected');
    expect(harness.sockets).toHaveLength(1);
    expect(window.location.pathname).toBe('/');
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


describe('player join recovery', () => {
  let root: Root;
  let game: ReturnType<typeof useGame>;

  function ReadGame() {
    game = useGame();
    return null;
  }

  function currentSocket(): SocketCallbacks {
    return harness.socketCallbacks.at(-1) as SocketCallbacks;
  }

  function join() {
    act(() => game.joinRoom('ABCD', 'Ada'));
    return currentSocket();
  }

  function joinedSnapshot(): RoomSnapshot {
    return snapshot({
      players: [{ id: 'client-id', name: 'Ada', score: 0, connected: true, isHost: true, spectator: false }]
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    resetServerClock();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('draw-party-client-id', 'client-id');
    localStorage.setItem('draw-party-session-token', 'session-token');
    localStorage.setItem('draw-party-name', 'Ada');
    window.name = '';
    window.history.replaceState(null, '', '/join/ABCD');
    harness.socketCallbacks.length = 0;
    harness.sockets.length = 0;
    harness.playCue.mockClear();
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(GameProvider, null, createElement(ReadGame))));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('cancels an initial pending join, retains the name, and ignores late callbacks', () => {
    const cancelled = join();
    expect(game.pendingJoin).toEqual({ roomCode: 'ABCD', name: 'Ada' });
    act(() => game.cancelJoin());
    expect(harness.sockets[0].close).toHaveBeenCalledOnce();
    expect(game.pendingJoin).toBeNull();
    expect(game.snapshot).toBeNull();
    expect(game.playerName).toBe('Ada');
    expect(game.roomCodeDraft).toBe('');
    expect(game.status).toBe('Ready to join');
    expect(window.location.pathname).toBe('/join');

    act(() => {
      cancelled.onOpen();
      cancelled.onMessage({ type: 'roomSnapshot', snapshot: joinedSnapshot() });
      cancelled.onStatus('Connected');
      cancelled.onClose();
      vi.advanceTimersByTime(5_000);
    });
    expect(harness.sockets[0].send).not.toHaveBeenCalled();
    expect(harness.sockets).toHaveLength(1);
    expect(game.snapshot).toBeNull();
    expect(game.pendingJoin).toBeNull();
    expect(game.status).toBe('Ready to join');
  });

  it('clears a scheduled retry on cancellation so a new join creates only one socket', () => {
    const first = join();
    act(() => first.onClose());
    act(() => game.cancelJoin());
    act(() => game.joinRoom('EFGH', 'Ada'));
    const second = currentSocket();
    act(() => {
      vi.advanceTimersByTime(5_000);
      second.onOpen();
    });
    expect(harness.sockets).toHaveLength(2);
    expect(harness.sockets[1].send).toHaveBeenCalledExactlyOnceWith({
      type: 'joinRoom', roomCode: 'EFGH', name: 'Ada'
    });
    expect(game.pendingJoin?.roomCode).toBe('EFGH');
  });

  it.each(['session_in_use', 'invalid_player_session'])('settles %s into an editable join without changing identity', (code) => {
    const socket = join();
    act(() => {
      socket.onOpen();
      socket.onMessage({ type: 'error', code, message: 'Session rejected' });
      socket.onClose();
      vi.advanceTimersByTime(5_000);
    });
    expect(game.pendingJoin).toBeNull();
    expect(game.snapshot).toBeNull();
    expect(game.playerName).toBe('Ada');
    expect(game.roomCodeDraft).toBe('ABCD');
    expect(game.status).toBe('Ready to join');
    expect(game.errorMessage).toContain(code === 'session_in_use' ? 'Close that tab' : 'Use the original device');
    expect(harness.sockets).toHaveLength(1);
    expect(harness.sockets[0].close).toHaveBeenCalledOnce();
    expect(localStorage.getItem('draw-party-client-id')).toBe('client-id');
    expect(localStorage.getItem('draw-party-session-token')).toBe('session-token');

    act(() => game.joinRoom('EFGH', 'Ada'));
    const retry = currentSocket();
    expect(retry.clientId).toBe(socket.clientId);
    expect(retry.sessionToken).toBe(socket.sessionToken);
  });

  it('uses the existing 1200ms backoff once and preserves the joined room while reconnecting', () => {
    const socket = join();
    act(() => {
      socket.onOpen();
      socket.onMessage({ type: 'roomSnapshot', snapshot: joinedSnapshot() });
      socket.onStatus('Disconnected');
      socket.onClose();
      socket.onClose();
    });
    expect(game.snapshot?.roomCode).toBe('ABCD');
    expect(game.pendingJoin?.roomCode).toBe('ABCD');
    act(() => vi.advanceTimersByTime(1_199));
    expect(harness.sockets).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(harness.sockets).toHaveLength(2);
    act(() => currentSocket().onOpen());
    expect(harness.sockets[1].send).toHaveBeenCalledExactlyOnceWith({
      type: 'joinRoom', roomCode: 'ABCD', name: 'Ada'
    });
  });

  it('preserves a draft and pending rename on reconnect, and waits for authoritative submission acceptance', () => {
    const socket = join();
    const current = { ...joinedSnapshot(), phase: 'guessing' as const, currentArtistId: 'artist-id' };
    act(() => {
      socket.onOpen();
      socket.onMessage({ type: 'roomSnapshot', snapshot: current });
    });
    const drafts = new TurnDraftCache();
    expect(drafts.saveGuess(current, 'client-id', 'A sleepy fox')).toBe(true);
    act(() => {
      game.setName('Ada Lovelace');
      game.submitAction('guess', { type: 'submitGuess', turnToken: 1, guess: 'A sleepy fox' });
      socket.onClose();
    });
    const originalRename = harness.sockets[0].send.mock.calls.find(
      ([message]) => message.type === 'setName'
    )![0];
    expect(game.pendingSubmission?.state).toBe('retry');
    act(() => vi.advanceTimersByTime(1_200));
    const replacement = currentSocket();
    act(() => {
      replacement.onOpen();
      replacement.onMessage({ type: 'roomSnapshot', snapshot: current });
    });
    expect(drafts.restore(current, 'client-id')).toMatchObject({ guess: 'A sleepy fox' });
    expect(harness.sockets[1].send.mock.calls.map(([message]) => message.type)).toEqual([
      'joinRoom', 'setName'
    ]);
    expect(harness.sockets[1].send).toHaveBeenLastCalledWith(originalRename);
    expect(game.playerName).toBe('Ada Lovelace');
    expect(game.pendingSubmission?.state).toBe('retry');

    act(() => {
      replacement.onMessage({ type: 'nameSet', requestId: originalRename.requestId, canonicalName: 'Ada Lovelace' });
      replacement.onMessage({
        type: 'roomSnapshot',
        snapshot: {
          ...current,
          players: current.players.map((player) => ({ ...player, name: 'Ada Lovelace' })),
          guessSubmittedIds: ['client-id']
        }
      });
    });
    expect(game.pendingSubmission?.state).toBe('accepted');
    expect(drafts.restore(current, 'client-id')).toBeNull();
    expect(sessionStorage.getItem(PENDING_RENAME_STORAGE_KEY)).toBeNull();
  });

  it('invalidates the current socket and removes retries when the provider unmounts', () => {
    const socket = join();
    act(() => socket.onClose());
    act(() => root.unmount());
    act(() => {
      socket.onOpen();
      socket.onMessage({ type: 'roomSnapshot', snapshot: joinedSnapshot() });
      socket.onClose();
      vi.advanceTimersByTime(5_000);
    });
    expect(harness.sockets).toHaveLength(1);
    expect(harness.sockets[0].send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
