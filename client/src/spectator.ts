import { el } from './dom';
import type { PlayerPublic } from './protocol';

export type ParticipationMode = 'play' | 'watch';

/** Connected non-spectators — the roster that counts for lobby readiness and turn progress. */
export function activePlayers(players: PlayerPublic[]): PlayerPublic[] {
  return players.filter((player) => player.connected && !player.spectator);
}

export function playingPlayers(players: PlayerPublic[]): PlayerPublic[] {
  return players.filter((player) => !player.spectator);
}

export function connectedSpectators(players: PlayerPublic[]): PlayerPublic[] {
  return players.filter((player) => player.connected && player.spectator);
}

export function isSpectator(players: PlayerPublic[], clientId: string): boolean {
  return Boolean(players.find((player) => player.id === clientId)?.spectator);
}

export function participationMode(players: PlayerPublic[], clientId: string): ParticipationMode {
  return isSpectator(players, clientId) ? 'watch' : 'play';
}

export function spectatorBanner(): HTMLElement {
  return el(
    'div',
    { class: 'spectator-banner' },
    el('span', { class: 'pill spectator-pill' }, 'Spectating'),
    el('p', { class: 'muted' }, 'Watch-only for now. You join as a player on the next drawing round.')
  );
}

export function playerCountLabel(
  players: PlayerPublic[],
  maxPlayers: number
): string {
  const connected = activePlayers(players).length;
  const spectators = connectedSpectators(players).length;
  const spectatorNote = spectators > 0 ? ` · ${spectators} spectating` : '';
  const playing = playingPlayers(players).length;
  return `${connected} connected · ${playing}/${maxPlayers} playing${spectatorNote}`;
}
