import { describe, expect, it } from 'vitest';
import { allocateReactionSlots, MAX_VISIBLE_REACTIONS } from './ReactionBar';

function bursts(count: number): Array<{ id: number; playerId: string }> {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    playerId: `player-${index + 1}`
  }));
}

describe('allocateReactionSlots', () => {
  it('keeps only the five newest bursts and assigns collision-free slots', () => {
    const allocated = allocateReactionSlots(bursts(8));

    expect(allocated.map((burst) => burst.id)).toEqual([4, 5, 6, 7, 8]);
    expect(new Set(allocated.map((burst) => burst.slot)).size).toBe(MAX_VISIBLE_REACTIONS);
    expect(allocated.every((burst) => burst.slot >= 0 && burst.slot < MAX_VISIBLE_REACTIONS)).toBe(true);
  });

  it('is deterministic for the same active burst sequence', () => {
    const active = bursts(5);

    expect(allocateReactionSlots(active)).toEqual(allocateReactionSlots(active));
  });
});
