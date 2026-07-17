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

  it('shows earlier stages once a later stage is active', () => {
    expect(stageVisible('correct', 'hold')).toBe(true);
    expect(stageVisible('correct', 'tally')).toBe(true);
    expect(stageVisible('correct', 'correct')).toBe(true);
    expect(stageVisible('correct', 'deltas')).toBe(false);
  });

  it('shows every stage when complete', () => {
    for (const target of stages) {
      expect(stageVisible('complete', target)).toBe(true);
    }
  });
});
