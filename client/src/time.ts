import type { RoomSnapshot } from './protocol';

let serverClockOffsetMs = 0;

export function syncServerClock(snapshot: RoomSnapshot): void {
  serverClockOffsetMs = snapshot.serverNowMs - Date.now();
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
