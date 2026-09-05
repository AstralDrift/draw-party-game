/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';
import {
  revealElapsedFromDeadline,
  revealStageAt,
  revealTimeline,
  presentationStageAt,
  stageVisible,
  type RevealStage
} from './useRevealStage';

vi.mock('../sound', () => ({
  playCue: vi.fn()
}));

describe('stageVisible', () => {
  const stages: RevealStage[] = ['hold', 'tally', 'spotlight', 'correct', 'deltas', 'complete'];

  it('exposes a full progressive visibility matrix', () => {
    const expected: Record<RevealStage, RevealStage[]> = {
      hold: ['hold'],
      tally: ['hold', 'tally'],
      spotlight: ['hold', 'tally', 'spotlight'],
      correct: ['hold', 'tally', 'spotlight', 'correct'],
      deltas: ['hold', 'tally', 'spotlight', 'correct', 'deltas'],
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
  it('resumes absolute show beats and skips a missing spotlight without changing motion timing', () => {
    const show = { startedAtMs: 1000, tallyAtMs: 1560, spotlightAtMs: 3800,
      truthAtMs: 6600, scoresAtMs: 10100, continueAtMs: 13600, spotlightOptionId: 'fake' };
    expect(presentationStageAt(1000, show)).toBe('hold');
    expect(presentationStageAt(1560, show)).toBe('tally');
    expect(presentationStageAt(5000, show)).toBe('spotlight');
    expect(presentationStageAt(6600, show)).toBe('correct');
    expect(presentationStageAt(10100, show)).toBe('deltas');
    expect(presentationStageAt(13600, show)).toBe('complete');
    expect(presentationStageAt(3800, { ...show, spotlightOptionId: null, truthAtMs: 3800 })).toBe('correct');
  });
  it('gives large reveals a full truth beat and scoring beat within ten seconds', () => {
    const timeline = revealTimeline(8);

    expect(timeline).toEqual({
      tallyAt: 600,
      correctAt: 2060,
      deltasAt: 5060,
      completeAt: 9060
    });
    expect(timeline.deltasAt - timeline.correctAt).toBeGreaterThanOrEqual(3000);
    expect(timeline.completeAt - timeline.deltasAt).toBeGreaterThanOrEqual(4000);
    expect(timeline.completeAt).toBeLessThanOrEqual(10_000);
  });

  it('keeps smaller reveals brisk while adding reading time as the option set grows', () => {
    expect(revealTimeline(3)).toEqual({
      tallyAt: 600,
      correctAt: 1460,
      deltasAt: 2960,
      completeAt: 4960
    });
    expect(revealTimeline(5)).toEqual({
      tallyAt: 600,
      correctAt: 1700,
      deltasAt: 3700,
      completeAt: 6700
    });
  });

  it('selects the stage at every boundary', () => {
    expect(revealStageAt(0, 3)).toBe('hold');
    expect(revealStageAt(599, 3)).toBe('hold');
    expect(revealStageAt(600, 3)).toBe('tally');
    expect(revealStageAt(1459, 3)).toBe('tally');
    expect(revealStageAt(1460, 3)).toBe('correct');
    expect(revealStageAt(2959, 3)).toBe('correct');
    expect(revealStageAt(2960, 3)).toBe('deltas');
    expect(revealStageAt(4959, 3)).toBe('deltas');
    expect(revealStageAt(4960, 3)).toBe('complete');
  });

  it('resumes from the authoritative result start after refresh or duplicate messages', () => {
    // Ten-second Results phase began at 2_000 and ends at 12_000.
    const elapsed = revealElapsedFromDeadline(12_000, 10, 5_000, 4_900);
    expect(elapsed).toBe(3_000);
    expect(revealStageAt(elapsed, 8)).toBe('correct');
    // Receipt time is irrelevant while a server deadline is present.
    expect(revealElapsedFromDeadline(12_000, 10, 5_000, 4_999)).toBe(3_000);
  });

  it('uses receipt time only for older snapshots without a deadline', () => {
    expect(revealElapsedFromDeadline(null, 10, 5_000, 4_200)).toBe(800);
  });

  it('keeps the same reveal beats when motion is reduced', () => {
    expect(revealStageAt(0, 8, true)).toBe('hold');
    expect(revealStageAt(2_060, 8, true)).toBe('correct');
    expect(revealStageAt(9_060, 8, true)).toBe('complete');
  });
});
