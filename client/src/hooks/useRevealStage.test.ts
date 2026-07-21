/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import {
  revealElapsedFromDeadline,
  revealStageAt,
  revealTimeline,
  stageVisible,
  type RevealStage
} from './useRevealStage';

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

describe('server-synchronized reveal timing', () => {
  it('fits an eight-option reveal inside 3.6 seconds', () => {
    expect(revealTimeline(8)).toEqual({
      tallyAt: 600,
      correctAt: 2060,
      deltasAt: 2810,
      completeAt: 3460
    });
    expect(revealTimeline(8).completeAt).toBeLessThanOrEqual(3600);
  });

  it('selects the stage at every boundary', () => {
    expect(revealStageAt(0, 3)).toBe('hold');
    expect(revealStageAt(599, 3)).toBe('hold');
    expect(revealStageAt(600, 3)).toBe('tally');
    expect(revealStageAt(1459, 3)).toBe('tally');
    expect(revealStageAt(1460, 3)).toBe('correct');
    expect(revealStageAt(2209, 3)).toBe('correct');
    expect(revealStageAt(2210, 3)).toBe('deltas');
    expect(revealStageAt(2859, 3)).toBe('deltas');
    expect(revealStageAt(2860, 3)).toBe('complete');
  });

  it('resumes from the authoritative result start after refresh or duplicate messages', () => {
    // Eight-second Results phase began at 2_000 and ends at 10_000.
    const elapsed = revealElapsedFromDeadline(10_000, 8, 5_000, 4_900);
    expect(elapsed).toBe(3_000);
    expect(revealStageAt(elapsed, 8)).toBe('deltas');
    // Receipt time is irrelevant while a server deadline is present.
    expect(revealElapsedFromDeadline(10_000, 8, 5_000, 4_999)).toBe(3_000);
  });

  it('uses receipt time only for older snapshots without a deadline', () => {
    expect(revealElapsedFromDeadline(null, 8, 5_000, 4_200)).toBe(800);
  });

  it('completes immediately for reduced motion', () => {
    expect(revealStageAt(0, 8, true)).toBe('complete');
  });
});
