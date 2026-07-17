import type { PlayerPublic } from './protocol';

export function isSelfHost(players: PlayerPublic[], clientId: string): boolean {
  return players.some((player) => player.id === clientId && player.isHost);
}

export function roomHost(players: PlayerPublic[]): PlayerPublic | undefined {
  return players.find((player) => player.isHost);
}
