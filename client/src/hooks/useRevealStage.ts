import { useEffect, useState } from 'react';
import type { RoundResult } from '../protocol';
import { playCue } from '../sound';

export type RevealStage = 'hold' | 'tally' | 'correct' | 'deltas' | 'complete';

const STAGE_ORDER: RevealStage[] = ['hold', 'tally', 'correct', 'deltas', 'complete'];
/** Hold → tally → correct → deltas → complete. Slightly longer hold/correct for TV drama. */
const STAGE_DELAYS_MS = [900, 1100, 800, 700];

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useRevealStage(
  result: RoundResult | null | undefined,
  turnToken: number
): { stage: RevealStage; complete: boolean } {
  const key = result ? `${result.artistId}:${result.correctAnswer}:${turnToken}` : '';
  const [stage, setStage] = useState<RevealStage>('hold');

  useEffect(() => {
    if (!result || !key) {
      setStage('hold');
      return;
    }

    if (prefersReducedMotion()) {
      setStage('complete');
      return;
    }

    setStage('hold');
    const timers: number[] = [];
    let elapsed = 0;
    for (let index = 1; index < STAGE_ORDER.length; index += 1) {
      elapsed += STAGE_DELAYS_MS[index - 1] ?? 600;
      const target = STAGE_ORDER[index];
      if (!target) {
        continue;
      }
      timers.push(
        window.setTimeout(() => {
          setStage(target);
          if (target === 'correct') {
            playCue('correct');
          } else if (target === 'deltas') {
            const fooled = result.breakdown.some((item) => !item.isCorrect && item.voterNames.length > 0);
            playCue(fooled ? 'fooled' : 'results');
          }
        }, elapsed)
      );
    }

    return () => {
      for (const id of timers) {
        window.clearTimeout(id);
      }
    };
  }, [key, result]);

  return { stage, complete: stage === 'complete' };
}

export function stageVisible(stage: RevealStage, target: RevealStage): boolean {
  if (stage === 'complete') {
    return true;
  }
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(target);
}
