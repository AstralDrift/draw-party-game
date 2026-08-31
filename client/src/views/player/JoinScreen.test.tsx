/**
 * @vitest-environment happy-dom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useGameMock = vi.hoisted(() => vi.fn());

vi.mock('../../app/GameProvider', () => ({
  useGame: useGameMock
}));

import { JoinScreen } from './JoinScreen';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true
});

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn(() => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  }))
});

interface JoinGameMockOverrides {
  initialRoomCode?: string;
  playerName?: string;
  roomCodeDraft?: string;
  pendingJoin?: { roomCode: string; name: string } | null;
  status?: string;
}

function renderJoinScreen(overrides: JoinGameMockOverrides = {}) {
  const joinRoom = vi.fn();
  const setErrorMessage = vi.fn();
  useGameMock.mockReturnValue({
    role: 'player',
    snapshot: null,
    initialRoomCode: '',
    pendingJoin: null,
    status: 'Ready to join',
    errorMessage: '',
    playerName: 'Ada',
    roomCodeDraft: 'ABCD',
    setPlayerName: vi.fn(),
    setRoomCodeDraft: vi.fn(),
    setErrorMessage,
    joinRoom,
    cancelJoin: vi.fn(),
    clearError: vi.fn(),
    ...overrides
  });

  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(<JoinScreen />));

  return {
    container,
    joinRoom,
    setErrorMessage,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    }
  };
}

function requiredElement<T extends Element>(container: ParentNode, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Expected ${selector}`);
  }
  return element;
}

describe('JoinScreen keyboard flow', () => {
  beforeEach(() => {
    useGameMock.mockReset();
    document.body.innerHTML = '';
  });

  it('moves from room code to Name on Enter or a form-level Next without joining', () => {
    const screen = renderJoinScreen();

    try {
      const roomCode = requiredElement<HTMLInputElement>(screen.container, 'input[name="roomCode"]');
      const name = requiredElement<HTMLInputElement>(screen.container, 'input[name="name"]');
      const form = requiredElement<HTMLFormElement>(screen.container, 'form');

      expect(roomCode.labels?.[0]?.textContent).toContain('Room code');

      roomCode.focus();
      act(() => {
        roomCode.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
        );
      });
      expect(document.activeElement).toBe(name);
      expect(screen.joinRoom).not.toHaveBeenCalled();

      roomCode.focus();
      act(() => form.requestSubmit());
      expect(document.activeElement).toBe(name);
      expect(screen.joinRoom).not.toHaveBeenCalled();
    } finally {
      screen.unmount();
    }
  });

  it('focuses Name immediately for a room-code deep link', () => {
    const screen = renderJoinScreen({ initialRoomCode: 'ABCD', roomCodeDraft: 'ABCD' });

    try {
      const name = requiredElement<HTMLInputElement>(screen.container, 'input[name="name"]');
      expect(screen.container.querySelector('input[name="roomCode"]')).toBeNull();
      expect(screen.container.querySelector('.player-room-chip')).toBeNull();
      expect(screen.container.querySelector('.eyebrow')?.textContent).toBe('ABCD');
      expect(document.activeElement).toBe(name);
      expect(name.labels?.[0]?.textContent).toContain('Name');
      const changeRoom = requiredElement<HTMLButtonElement>(
        screen.container,
        'button.join-change-room'
      );
      expect(changeRoom.textContent).toContain('Change room');
      expect(changeRoom.className).toContain('btn--ghost');
      expect(changeRoom.className).not.toContain('btn--wide');
      expect(changeRoom.className).not.toContain('btn--secondary');
    } finally {
      screen.unmount();
    }
  });

  it('joins exactly once when Name submits', () => {
    const screen = renderJoinScreen({ initialRoomCode: 'ABCD', roomCodeDraft: 'ABCD' });

    try {
      const name = requiredElement<HTMLInputElement>(screen.container, 'input[name="name"]');
      const form = requiredElement<HTMLFormElement>(screen.container, 'form');
      name.focus();

      act(() => {
        form.requestSubmit();
        form.requestSubmit();
      });

      expect(screen.joinRoom).toHaveBeenCalledOnce();
      expect(screen.joinRoom).toHaveBeenCalledWith('ABCD', 'Ada');
    } finally {
      screen.unmount();
    }
  });

  it('keeps a blank name in the form and associates its validation message', () => {
    const screen = renderJoinScreen({ playerName: '' });

    try {
      const name = requiredElement<HTMLInputElement>(screen.container, 'input[name="name"]');
      const form = requiredElement<HTMLFormElement>(screen.container, 'form');
      name.focus();

      act(() => form.requestSubmit());

      expect(screen.joinRoom).not.toHaveBeenCalled();
      expect(screen.setErrorMessage).toHaveBeenCalledWith(
        'Enter your name so everyone knows who is playing.'
      );
      expect(name.value).toBe('');
      expect(name.getAttribute('aria-invalid')).toBe('true');
      expect(name.getAttribute('aria-describedby')).toBe('join-player-name-error');
      expect(screen.container.querySelector('#join-player-name-error')?.textContent).toBe(
        'Enter your name so everyone knows who is playing.'
      );
      expect(document.activeElement).toBe(name);
    } finally {
      screen.unmount();
    }
  });

  it('focuses and describes an incomplete room code when Name submits', () => {
    const screen = renderJoinScreen({ roomCodeDraft: 'ABC' });

    try {
      const roomCode = requiredElement<HTMLInputElement>(screen.container, 'input[name="roomCode"]');
      const name = requiredElement<HTMLInputElement>(screen.container, 'input[name="name"]');
      const form = requiredElement<HTMLFormElement>(screen.container, 'form');
      name.focus();

      act(() => form.requestSubmit());

      expect(screen.joinRoom).not.toHaveBeenCalled();
      expect(screen.setErrorMessage).toHaveBeenCalledWith(
        'Enter the four-letter room code from the TV.'
      );
      expect(roomCode.getAttribute('aria-invalid')).toBe('true');
      expect(roomCode.getAttribute('aria-describedby')).toBe('join-room-code-error');
      expect(screen.container.querySelector('#join-room-code-error')?.textContent).toBe(
        'Enter the four-letter room code from the TV.'
      );
      expect(document.activeElement).toBe(roomCode);
    } finally {
      screen.unmount();
    }
  });

  it('keeps the join form while seating instead of a second headline', () => {
    const screen = renderJoinScreen({
      initialRoomCode: 'ABCD',
      pendingJoin: { roomCode: 'ABCD', name: 'Ada' },
      status: 'Connecting'
    });

    try {
      expect(screen.container.querySelector('h2')).toBeNull();
      expect(screen.container.textContent).not.toContain('Almost in');
      expect(screen.container.textContent).not.toContain('Seating you');
      expect(screen.container.querySelector('.eyebrow')?.textContent).toBe('ABCD');
      const name = requiredElement<HTMLInputElement>(screen.container, 'input[name="name"]');
      expect(name.disabled).toBe(true);
      const submit = requiredElement<HTMLButtonElement>(screen.container, 'button[type="submit"]');
      expect(submit.disabled).toBe(true);
      expect(submit.textContent).toContain('Joining');
      expect(screen.container.querySelector('button.join-change-room')).toBeNull();
    } finally {
      screen.unmount();
    }
  });
});
