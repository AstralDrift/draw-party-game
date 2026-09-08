/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameSocket } from './net';

class MockWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];
  readyState: number = MockWebSocket.CONNECTING;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSING;
  });

  constructor(readonly url: URL) {
    super();
    MockWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  message(data: string): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  disconnect(code = 1006): void {
    this.readyState = MockWebSocket.CLOSED;
    this.dispatchEvent(new CloseEvent('close', { code }));
  }
}

function setup() {
  const callbacks = {
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onStatus: vi.fn(),
    onMessage: vi.fn()
  };
  const socket = new GameSocket({
    role: 'player',
    clientId: 'client-id',
    sessionToken: 'session-token',
    roomCode: 'ABCD',
    ...callbacks
  });
  socket.connect();
  const transport = MockWebSocket.instances.at(-1)!;
  return { socket, transport, ...callbacks };
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const pong = JSON.stringify({ type: 'pong', nowMs: 1_000 });

describe('GameSocket recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket);
    MockWebSocket.instances = [];
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reconnects a silent OPEN socket once after 45 seconds without waiting for a close event', () => {
    const test = setup();
    test.transport.open();
    vi.advanceTimersByTime(44_999);
    expect(test.transport.send.mock.calls).toEqual([
      [JSON.stringify({ type: 'heartbeat' })],
      [JSON.stringify({ type: 'heartbeat' })]
    ]);
    expect(test.onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(test.transport.close).toHaveBeenCalledOnce();
    expect(test.onClose).toHaveBeenCalledOnce();
    expect(test.socket.isOpen()).toBe(false);
    expect(test.onStatus).toHaveBeenLastCalledWith('Disconnected');

    test.transport.disconnect();
    vi.advanceTimersByTime(60_000);
    expect(test.onClose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a connection that never opens', () => {
    const test = setup();
    vi.advanceTimersByTime(45_000);
    expect(test.onOpen).not.toHaveBeenCalled();
    expect(test.onClose).toHaveBeenCalledOnce();
    test.transport.open();
    expect(test.onOpen).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes the inactivity window only for valid protocol messages', () => {
    const test = setup();
    test.transport.open();
    vi.advanceTimersByTime(40_000);
    test.transport.message(pong);
    expect(test.onMessage).toHaveBeenCalledWith({ type: 'pong', nowMs: 1_000 });
    vi.advanceTimersByTime(40_000);
    test.transport.message('{invalid json');
    test.transport.message(JSON.stringify({ type: 'pong', nowMs: 'invalid' }));
    test.transport.message(JSON.stringify({ type: 'unknown' }));
    expect(test.onMessage).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(4_999);
    expect(test.onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(test.onClose).toHaveBeenCalledOnce();
  });

  it('pauses stale checks when hidden and probes immediately on foreground', () => {
    const test = setup();
    test.transport.open();
    vi.advanceTimersByTime(40_000);
    setVisibility('hidden');
    vi.advanceTimersByTime(120_000);
    window.dispatchEvent(new Event('online'));
    expect(test.onClose).not.toHaveBeenCalled();
    const previousSends = test.transport.send.mock.calls.length;
    setVisibility('visible');
    expect(test.transport.send).toHaveBeenCalledTimes(previousSends + 1);
    vi.advanceTimersByTime(4_999);
    expect(test.onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(test.onClose).toHaveBeenCalledOnce();
  });

  it('accepts a foreground reply and rearms normal liveness without reconnecting', () => {
    const test = setup();
    test.transport.open();
    setVisibility('hidden');
    vi.advanceTimersByTime(60_000);
    setVisibility('visible');
    vi.advanceTimersByTime(4_000);
    test.transport.message(pong);
    vi.advanceTimersByTime(44_999);
    expect(test.onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(test.onClose).toHaveBeenCalledOnce();
  });

  it('does not extend or duplicate an online probe for repeated events or malformed replies', () => {
    const test = setup();
    test.transport.open();
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(4_000);
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    test.transport.message(JSON.stringify({ type: 'pong' }));
    expect(test.transport.send).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1_000);
    expect(test.onClose).toHaveBeenCalledOnce();
  });

  it('cancels the foreground deadline when the phone hides again', () => {
    const test = setup();
    test.transport.open();
    window.dispatchEvent(new Event('online'));
    setVisibility('hidden');
    vi.advanceTimersByTime(60_000);
    expect(test.onClose).not.toHaveBeenCalled();
    test.socket.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up explicit cancellation and ignores all late transport callbacks', () => {
    const test = setup();
    test.socket.close();
    test.onStatus.mockClear();
    test.transport.open();
    test.transport.message(pong);
    test.transport.dispatchEvent(new Event('error'));
    test.transport.disconnect();
    window.dispatchEvent(new Event('online'));
    setVisibility('hidden');
    setVisibility('visible');
    vi.advanceTimersByTime(60_000);
    expect(test.onOpen).not.toHaveBeenCalled();
    expect(test.onMessage).not.toHaveBeenCalled();
    expect(test.onClose).not.toHaveBeenCalled();
    expect(test.onStatus).not.toHaveBeenCalled();
    expect(test.transport.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the replacement connection protected from stale messages and close events', () => {
    const test = setup();
    test.transport.open();
    test.socket.connect();
    const replacement = MockWebSocket.instances.at(-1)!;
    replacement.open();
    test.transport.message(pong);
    test.transport.disconnect();
    expect(test.onMessage).not.toHaveBeenCalled();
    expect(test.onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(15_000);
    expect(test.transport.send).not.toHaveBeenCalled();
    expect(replacement.send).toHaveBeenCalledOnce();
    test.socket.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the server supersession stop without an automatic reconnect', () => {
    const test = setup();
    test.transport.open();
    test.transport.disconnect(4001);
    vi.advanceTimersByTime(60_000);
    expect(test.onClose).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
