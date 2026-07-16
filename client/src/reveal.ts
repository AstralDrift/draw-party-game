import type { RoundResult } from './protocol';
import { playCue } from './sound';

export type RevealStage = 'hold' | 'tally' | 'correct' | 'deltas' | 'complete';

const STAGE_ORDER: RevealStage[] = ['hold', 'tally', 'correct', 'deltas', 'complete'];
const STAGE_DELAYS_MS = [600, 1000, 500, 600];

let revealKey = '';
let revealStage: RevealStage = 'hold';
let lastAppliedStage: RevealStage | null = null;
let revealTimers: number[] = [];
let advanceButton: HTMLButtonElement | null = null;

export function resetReveal(): void {
  clearRevealTimers();
  revealKey = '';
  revealStage = 'hold';
  lastAppliedStage = null;
  advanceButton = null;
}

export function isRevealComplete(): boolean {
  return revealStage === 'complete';
}

export function bindAdvanceButton(button: HTMLButtonElement | null): void {
  advanceButton = button;
  syncAdvanceButton();
}

export function scheduleReveal(root: HTMLElement, result: RoundResult, turnToken: number): void {
  const key = `${result.artistId}:${result.correctAnswer}:${turnToken}`;
  const isNewReveal = revealKey !== key;
  if (isNewReveal) {
    clearRevealTimers();
    revealKey = key;
    revealStage = prefersReducedMotion() ? 'complete' : 'hold';
    lastAppliedStage = null;
  }
  applyRevealStage(root, revealStage, result);
  syncAdvanceButton();
  if (!isNewReveal || revealStage === 'complete') {
    return;
  }

  let elapsed = 0;
  for (let index = 1; index < STAGE_ORDER.length; index += 1) {
    elapsed += STAGE_DELAYS_MS[index - 1] ?? 600;
    const target = STAGE_ORDER[index];
    if (!target) {
      continue;
    }
    revealTimers.push(
      window.setTimeout(() => {
        if (revealKey !== key) {
          return;
        }
        revealStage = target;
        applyRevealStage(root, target, result);
        syncAdvanceButton();
      }, elapsed)
    );
  }
}

function clearRevealTimers(): void {
  for (const id of revealTimers) {
    window.clearTimeout(id);
  }
  revealTimers = [];
}

function syncAdvanceButton(): void {
  if (!advanceButton) {
    return;
  }
  advanceButton.disabled = !isRevealComplete();
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function applyRevealStage(root: HTMLElement, stage: RevealStage, result: RoundResult): void {
  const stageChanged = lastAppliedStage !== stage;
  lastAppliedStage = stage;
  root.dataset.revealStage = stage;
  root.querySelectorAll<HTMLElement>('.reveal-stage').forEach((node) => {
    node.classList.remove('is-visible');
  });
  const show = (selector: string): void => {
    root.querySelectorAll<HTMLElement>(selector).forEach((node) => node.classList.add('is-visible'));
  };

  const stageIndex = STAGE_ORDER.indexOf(stage);
  if (stageIndex >= 0) {
    show('.reveal-stage-hold, .reveal-stage-drawing');
  }
  if (stageIndex >= 1) {
    show('.reveal-stage-tally');
  }
  if (stageIndex >= 2) {
    show('.reveal-stage-correct');
  }
  if (stageIndex >= 3) {
    show('.reveal-stage-deltas');
  }
  if (stage === 'complete') {
    root.querySelectorAll<HTMLElement>('.reveal-stage').forEach((node) => node.classList.add('is-visible'));
    root.querySelectorAll('.confetti').forEach((node) => node.classList.add('is-visible'));
  }

  if (!stageChanged) {
    return;
  }
  if (stage === 'correct') {
    playCue('correct');
  } else if (stage === 'deltas') {
    const fooled = result.breakdown.some((item) => !item.isCorrect && item.voterNames.length > 0);
    playCue(fooled ? 'fooled' : 'results');
  }
}
