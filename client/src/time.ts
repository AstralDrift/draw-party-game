import type { RoomSnapshot } from './protocol';

let serverClockOffsetMs = 0;
let hasServerClockSample = false;

/** Start a new connection's sample window without making an active timer jump. */
export function beginServerClockSession(): void {
  hasServerClockSample = false;
}

/** Hard reset for teardown and deterministic tests. */
export function resetServerClock(): void {
  serverClockOffsetMs = 0;
  hasServerClockSample = false;
}

export function syncServerTime(serverNowMs: number, receivedAtMs = Date.now()): void {
  const candidateOffsetMs = serverNowMs - receivedAtMs;
  if (!hasServerClockSample || candidateOffsetMs > serverClockOffsetMs) {
    // Transit delay can only make this sample smaller. The maximum candidate is
    // therefore the least-delayed clock estimate observed on this connection.
    serverClockOffsetMs = candidateOffsetMs;
  }
  hasServerClockSample = true;
}

export function syncServerClock(snapshot: RoomSnapshot): void {
  syncServerTime(snapshot.serverNowMs);
}

export function nowMs(): number {
  return Date.now() + serverClockOffsetMs;
}

export function formatDeadline(snapshot: RoomSnapshot | null): string {
  if (!snapshot?.deadlineMs) {
    return '';
  }
  const remaining = Math.max(0, snapshot.deadlineMs - nowMs());
  const seconds = Math.ceil(remaining / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
