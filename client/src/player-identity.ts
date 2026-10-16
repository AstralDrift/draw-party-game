const PLAYER_ACCENT_COUNT = 8;

/** Stable across roster reorder and reconnect; deliberately independent of array position. */
export function playerAccentSlot(playerId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % PLAYER_ACCENT_COUNT;
}

export function playerInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?';
}
