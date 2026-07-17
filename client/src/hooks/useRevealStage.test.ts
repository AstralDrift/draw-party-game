/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import { stageVisible, type RevealStage } from './useRevealStage';

vi.mock('../sound', () => ({
  playCue: vi.fn()
}));

describe('stageVisible', () => {
  const stages: RevealStage[] = ['hold', 'tally', 'correct', 'deltas', 'complete'];

  it('exposes a full progressive visibility matrix', () => {
    const expected: Record<RevealStage, RevealStage[]> = {
      hold: ['hold'],
      tally: ['hold', 'tally'],
      correct: ['hold', 'tally', 'correct'],
      deltas: ['hold', 'tally', 'correct', 'deltas'],
      complete: stages
    };

    for (const current of stages) {
      for (const target of stages) {
        expect(stageVisible(current, target)).toBe(expected[current].includes(target));
      }
    }
  });
});
