import { describe, expect, it } from 'vitest';
import {
  activePlayers,
  connectedSpectators,
  participationMode,
  playerCountLabel,
  playingPlayers
} from './spectator';
import type { PlayerPublic } from './protocol';

function player(partial: Partial<PlayerPublic> & Pick<PlayerPublic, 'id'>): PlayerPublic {
  return {
    name: partial.name ?? partial.id,
    score: partial.score ?? 0,
    connected: partial.connected ?? true,
    spectator: partial.spectator ?? false,
    ...partial
  };
}

describe('spectator helpers', () => {
  const roster = [
    player({ id: 'a', connected: true, spectator: false }),
    player({ id: 'b', connected: false, spectator: false }),
    player({ id: 'c', connected: true, spectator: true }),
    player({ id: 'd', connected: false, spectator: true })
  ];

  it('activePlayers keeps connected non-spectators only', () => {
    expect(activePlayers(roster).map((entry) => entry.id)).toEqual(['a']);
  });

  it('playingPlayers excludes spectators regardless of connection', () => {
    expect(playingPlayers(roster).map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('connectedSpectators lists live watchers', () => {
    expect(connectedSpectators(roster).map((entry) => entry.id)).toEqual(['c']);
  });

  it('participationMode derives play vs watch', () => {
    expect(participationMode(roster, 'a')).toBe('play');
    expect(participationMode(roster, 'c')).toBe('watch');
    expect(participationMode(roster, 'missing')).toBe('play');
  });

  it('playerCountLabel summarizes occupancy', () => {
    expect(playerCountLabel(roster, 8)).toBe('1 connected · 2/8 playing · 1 spectating');
  });
});
