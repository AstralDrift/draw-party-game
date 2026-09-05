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
});
