import { useEffect, useRef, useState } from 'react';
import type { ResultPresentation, RoundResult } from '../protocol';
import { playCue } from '../sound';
import { nowMs } from '../time';

export type RevealStage = 'hold' | 'tally' | 'spotlight' | 'correct' | 'deltas' | 'complete';

const STAGE_ORDER: RevealStage[] = ['hold', 'tally', 'spotlight', 'correct', 'deltas', 'complete'];
const HOLD_MS = 600;
export const OPTION_STAGGER_MS = 120;
const READING_BEAT_MS = 500;
const LARGE_OPTION_COUNT = 6;
const MEDIUM_OPTION_COUNT = 4;
const SMALL_TRUTH_BEAT_MS = 1500;
const SMALL_SCORE_BEAT_MS = 2000;
const MEDIUM_TRUTH_BEAT_MS = 2000;
const MEDIUM_SCORE_BEAT_MS = 3000;
const LARGE_TRUTH_BEAT_MS = 3000;
const LARGE_SCORE_BEAT_MS = 4000;

export interface RevealTimeline {
  tallyAt: number;
  correctAt: number;
  deltasAt: number;
  completeAt: number;
}

function revealReadingBeats(optionCount: number): { truthMs: number; scoreMs: number } {
  if (optionCount >= LARGE_OPTION_COUNT) {
    return { truthMs: LARGE_TRUTH_BEAT_MS, scoreMs: LARGE_SCORE_BEAT_MS };
  }
  if (optionCount >= MEDIUM_OPTION_COUNT) {
    return { truthMs: MEDIUM_TRUTH_BEAT_MS, scoreMs: MEDIUM_SCORE_BEAT_MS };
  }
  return { truthMs: SMALL_TRUTH_BEAT_MS, scoreMs: SMALL_SCORE_BEAT_MS };
}

export function revealTimeline(optionCount: number): RevealTimeline {
  const safeOptionCount = Math.max(0, Math.floor(optionCount));
  const beats = revealReadingBeats(safeOptionCount);
  const tallyAt = HOLD_MS;
  const correctAt = tallyAt + safeOptionCount * OPTION_STAGGER_MS + READING_BEAT_MS;
  const deltasAt = correctAt + beats.truthMs;
  return {
    tallyAt,
    correctAt,
    deltasAt,
    completeAt: deltasAt + beats.scoreMs
  };
}

export function revealStageAt(
  elapsedMs: number,
  optionCount: number,
  _reducedMotion = false
): RevealStage {
  // Motion preference changes how each beat appears, not when shared-room information
  // becomes visible or when the host may advance. CSS removes the transitions.
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

function presentationBoundaries(show: ResultPresentation): Array<[RevealStage, number]> {
  return [
    ['tally', show.tallyAtMs],
    ...(show.spotlightOptionId ? [['spotlight', show.spotlightAtMs] as [RevealStage, number]] : []),
    ['correct', show.truthAtMs],
    ['deltas', show.scoresAtMs],
    ['complete', show.continueAtMs]
  ];
}

export function presentationStageAt(currentMs: number, show: ResultPresentation): RevealStage {
  let stage: RevealStage = 'hold';
  for (const [target, atMs] of presentationBoundaries(show)) {
    if (currentMs >= atMs) stage = target;
  }
  return stage;
}

export function useRevealStage(
  result: RoundResult | null | undefined,
  turnToken: number,
  deadlineMs?: number | null,
  resultsSeconds = 10,
  presentation?: ResultPresentation | null
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
    const elapsed = () => presentation
      ? Math.max(0, nowMs() - presentation.startedAtMs)
      : revealElapsedFromDeadline(deadlineMs, resultsSeconds, nowMs(), fallbackStartMs);
    const current = () => presentation
      ? presentationStageAt(nowMs(), presentation)
      : revealStageAt(elapsed(), optionCount, reducedMotion);
    setStage(current());

    const timeline = revealTimeline(optionCount);
    const timers: number[] = [];
    const boundaries: Array<[RevealStage, number]> = presentation
      ? presentationBoundaries(presentation).map(([target, atMs]) => [target, atMs - presentation.startedAtMs])
      : [
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
          const currentStage = current();
          setStage(currentStage);
          if (currentStage === 'spotlight' && target === 'spotlight') {
            playCue('fooled', `${key}:spotlight`);
          } else if (currentStage === 'correct' && target === 'correct') {
            playCue('correct', `${key}:correct`);
          } else if (currentStage === 'deltas' && target === 'deltas') {
            playCue(!presentation && fooled ? 'fooled' : 'results', `${key}:scores`);
          }
        }, remainingMs)
      );
    }

    const onVisible = () => { if (!document.hidden) setStage(current()); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      for (const id of timers) window.clearTimeout(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [deadlineMs, fooled, key, optionCount, result, resultsSeconds, presentation]);

  return { stage, complete: stage === 'complete' };
}

export function stageVisible(stage: RevealStage, target: RevealStage): boolean {
  if (stage === 'complete') {
    return true;
  }
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(target);
}
