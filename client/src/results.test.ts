import { describe, expect, it } from 'vitest';
import { revealStandings } from './results';
import type { RoundResult } from './protocol';

describe('reveal standings', () => {
  it('uses authoritative totals, tracks overtakes and shares tied ranks', () => {
    const result = { scoreDeltas: [
      { playerId: 'a', name: 'Ava', scoreAfter: 200, delta: 200 },
      { playerId: 'b', name: 'Bo', scoreAfter: 200, delta: 50 },
      { playerId: 'c', name: 'Cy', scoreAfter: 100, delta: 0 }
    ] } as RoundResult;
    const rows = revealStandings(result);
    expect(rows.map(({ playerId, rank, movement }) => ({ playerId, rank, movement }))).toEqual([
      { playerId: 'a', rank: 1, movement: 2 },
      { playerId: 'b', rank: 1, movement: 0 },
      { playerId: 'c', rank: 3, movement: -1 }
    ]);
    expect(revealStandings(result, [{ playerId: 'retired', name: 'Dee', score: 250 }, ...rows])[0])
      .toMatchObject({ playerId: 'retired', delta: 0, rank: 1, movement: 0 });
  });

  it('shows current participants while keeping departed scores in the rank calculation', () => {
    const scores = Array.from({ length: 16 }, (_, index) => ({
      playerId: `player-${index}`, name: `Player ${index}`, score: 1600 - index * 100
    }));
    const playerIds = scores.slice(8).map((score) => score.playerId);
    const result = { scoreDeltas: [{ playerId: 'player-8', name: 'Player 8', delta: 200, scoreAfter: 800 }] } as RoundResult;
    const rows = revealStandings(result, scores, playerIds);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ playerId: 'player-8', rank: 9, movement: 1, score: 800 });
    expect(scores).toHaveLength(16);
  });

});
