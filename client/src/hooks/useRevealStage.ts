import { useEffect, useRef, useState } from 'react';
import type { RoundResult } from '../protocol';
import { playCue } from '../sound';
import { nowMs } from '../time';

export type RevealStage = 'hold' | 'tally' | 'correct' | 'deltas' | 'complete';

const STAGE_ORDER: RevealStage[] = ['hold', 'tally', 'correct', 'deltas', 'complete'];
const HOLD_MS = 600;
export const OPTION_STAGGER_MS = 120;
const READING_BEAT_MS = 500;
const TRUTH_BEAT_MS = 750;
const SCORE_BEAT_MS = 650;

export interface RevealTimeline {
  tallyAt: number;
  correctAt: number;
  deltasAt: number;
  completeAt: number;
}

export function revealTimeline(optionCount: number): RevealTimeline {
  const safeOptionCount = Math.max(0, Math.floor(optionCount));
  const tallyAt = HOLD_MS;
  const correctAt = tallyAt + safeOptionCount * OPTION_STAGGER_MS + READING_BEAT_MS;
  const deltasAt = correctAt + TRUTH_BEAT_MS;
  return {
    tallyAt,
    correctAt,
    deltasAt,
    completeAt: deltasAt + SCORE_BEAT_MS
  };
}

export function revealStageAt(
  elapsedMs: number,
  optionCount: number,
  reducedMotion = false
): RevealStage {
  if (reducedMotion) {
    return 'complete';
  }
  const elapsed = Math.max(0, elapsedMs);
  const timeline = revealTimeline(optionCount);
  if (elapsed < timeline.tallyAt) return 'hold';
  if (elapsed < timeline.correctAt) return 'tally';
  if (elapsed < timeline.deltasAt) return 'correct';
  if (elapsed < timeline.completeAt) return 'deltas';
  return 'complete';
}

/** Resume from the server-owned Results deadline rather than restarting on receipt/refresh. */
export function revealElapsedFromDeadline(
  deadlineMs: number | null | undefined,
  resultsSeconds: number,
  currentMs: number,
  fallbackStartMs: number
): number {
  const resultStartMs = deadlineMs
    ? deadlineMs - Math.max(0, resultsSeconds) * 1000
    : fallbackStartMs;
  return Math.max(0, currentMs - resultStartMs);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useRevealStage(
  result: RoundResult | null | undefined,
  turnToken: number,
  deadlineMs?: number | null,
  resultsSeconds = 8
): { stage: RevealStage; complete: boolean } {
  const key = result ? `${result.artistId}:${result.correctAnswer}:${turnToken}` : '';
  const [stage, setStage] = useState<RevealStage>('hold');
  const fallbackStartRef = useRef<{ key: string; atMs: number }>({ key: '', atMs: 0 });
  const optionCount = result?.breakdown.length ?? 0;
  const fooled = Boolean(result?.breakdown.some((item) => !item.isCorrect && item.voterNames.length > 0));

  useEffect(() => {
    if (!result || !key) {
      setStage('hold');
      return;
    }

    if (fallbackStartRef.current.key !== key) {
      fallbackStartRef.current = { key, atMs: nowMs() };
    }

    const reducedMotion = prefersReducedMotion();
    const fallbackStartMs = fallbackStartRef.current.atMs;
    const elapsed = () =>
      revealElapsedFromDeadline(deadlineMs, resultsSeconds, nowMs(), fallbackStartMs);
    setStage(revealStageAt(elapsed(), optionCount, reducedMotion));
    if (reducedMotion) {
      return;
    }

    const timeline = revealTimeline(optionCount);
    const timers: number[] = [];
    const boundaries: Array<[RevealStage, number]> = [
      ['tally', timeline.tallyAt],
      ['correct', timeline.correctAt],
      ['deltas', timeline.deltasAt],
      ['complete', timeline.completeAt]
    ];
    for (const [target, atMs] of boundaries) {
      const remainingMs = atMs - elapsed();
      if (remainingMs <= 0) continue;
      timers.push(
        window.setTimeout(() => {
          const currentStage = revealStageAt(elapsed(), optionCount);
          setStage(currentStage);
          if (currentStage === 'correct' && target === 'correct') {
            playCue('correct');
          } else if (currentStage === 'deltas' && target === 'deltas') {
            playCue(fooled ? 'fooled' : 'results');
          }
        }, remainingMs)
      );
    }

    return () => {
      for (const id of timers) {
        window.clearTimeout(id);
      }
    };
  }, [deadlineMs, fooled, key, optionCount, result, resultsSeconds]);

  return { stage, complete: stage === 'complete' };
}

export function stageVisible(stage: RevealStage, target: RevealStage): boolean {
  if (stage === 'complete') {
    return true;
  }
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(target);
}
