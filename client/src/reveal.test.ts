/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundResult } from './protocol';
import { bindAdvanceButton, isRevealComplete, resetReveal, scheduleReveal } from './reveal';

vi.mock('./sound', () => ({
  playCue: vi.fn()
}));

import { playCue } from './sound';

function result(overrides: Partial<RoundResult> = {}): RoundResult {
  return {
    artistId: 'a1',
    artistName: 'Ava',
    correctAnswer: 'banana detective',
    correctVoterNames: ['Bo'],
    nobodyFoundIt: false,
    perfectTruth: false,
    scoreDeltas: [],
    breakdown: [
      {
        optionId: 'opt-real',
        optionText: 'banana detective',
        voterNames: ['Bo'],
        isCorrect: true,
        authorName: null
      }
    ],
    ...overrides
  };
}

function revealRoot(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <div class="reveal-stage reveal-stage-hold"></div>
    <div class="reveal-stage reveal-stage-tally"></div>
    <div class="reveal-stage reveal-stage-correct"></div>
    <div class="reveal-stage reveal-stage-deltas"></div>
    <div class="reveal-stage reveal-stage-drawing"></div>
    <div class="confetti"></div>
  `;
  document.body.appendChild(root);
  return root;
}

afterEach(() => {
  resetReveal();
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('scheduleReveal', () => {
  it('jumps to complete when reduced motion is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    );
    const root = revealRoot();
    const button = document.createElement('button');
    bindAdvanceButton(button);
    scheduleReveal(root, result(), 7);
    expect(root.dataset.revealStage).toBe('complete');
    expect(isRevealComplete()).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it('plays cues only when the stage changes', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    );
    const root = revealRoot();
    const round = result();
    scheduleReveal(root, round, 1);
    const calls = vi.mocked(playCue).mock.calls.length;
    scheduleReveal(root, round, 1);
    expect(vi.mocked(playCue).mock.calls.length).toBe(calls);
  });
});
