import { describe, expect, it } from 'vitest';
import {
  activePlayers,
  connectedSpectators,
  isSpectator,
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
    expect(activePlayers([])).toEqual([]);
    expect(activePlayers([player({ id: 'x', connected: false })])).toEqual([]);
  });

  it('playingPlayers excludes spectators regardless of connection', () => {
    expect(playingPlayers(roster).map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('connectedSpectators lists live watchers', () => {
    expect(connectedSpectators(roster).map((entry) => entry.id)).toEqual(['c']);
  });

  it('participationMode and isSpectator treat missing ids as non-spectators', () => {
    expect(participationMode(roster, 'a')).toBe('play');
    expect(participationMode(roster, 'c')).toBe('watch');
    // Unknown client id is not treated as spectator (avoids locking joiners into watch UI).
    expect(participationMode(roster, 'missing')).toBe('play');
    expect(isSpectator(roster, 'c')).toBe(true);
    expect(isSpectator(roster, 'missing')).toBe(false);
  });

  it('playerCountLabel summarizes occupancy including empty and zero-spectator rooms', () => {
    expect(playerCountLabel(roster, 8)).toBe('1 connected · 2/8 playing · 1 spectating');
    expect(playerCountLabel([], 8)).toBe('0 connected · 0/8 playing');
    expect(playerCountLabel([player({ id: 'c', spectator: true })], 8)).toBe(
      '0 connected · 0/8 playing · 1 spectating'
    );
    expect(playerCountLabel([player({ id: 'a' }), player({ id: 'b' })], 8)).toBe(
      '2 connected · 2/8 playing'
    );
  });
});
