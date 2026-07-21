/**
 * @vitest-environment happy-dom
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RoundResult } from '../../protocol';
import type { RevealStage } from '../../hooks/useRevealStage';
import { ResultsPanel } from './ResultsPanel';

const result: RoundResult = {
  artistId: 'artist',
  artistName: 'Ari',
  correctAnswer: 'A moon taking a bath',
  correctVoterNames: ['Bo'],
  breakdown: [
    {
      optionId: 'truth',
      optionText: 'A moon taking a bath',
      voterNames: ['Bo'],
      isCorrect: true
    },
    {
      optionId: 'fake',
      optionText: 'Soap opera in space',
      voterNames: [],
      isCorrect: false,
      authorName: 'Cy'
    }
  ],
  scoreDeltas: [{ playerId: 'bo', name: 'Bo', delta: 1000 }],
  nobodyFoundIt: false,
  perfectTruth: false
};

function renderStage(stage: RevealStage): void {
  document.body.innerHTML = renderToStaticMarkup(
    <ResultsPanel result={result} drawing={null} stage={stage} includeDrawing={false} />
  );
}

function expectStageHidden(target: 'tally' | 'correct' | 'deltas', hidden: boolean): void {
  const nodes = [...document.querySelectorAll(`.reveal-stage-${target}`)];
  expect(nodes.length).toBeGreaterThan(0);
  for (const node of nodes) {
    expect(node.getAttribute('aria-hidden')).toBe(String(hidden));
  }
}

describe('ResultsPanel staged accessibility', () => {
  it.each<{
    stage: RevealStage;
    hidden: Record<'tally' | 'correct' | 'deltas', boolean>;
  }>([
    { stage: 'hold', hidden: { tally: true, correct: true, deltas: true } },
    { stage: 'tally', hidden: { tally: false, correct: true, deltas: true } },
    { stage: 'correct', hidden: { tally: false, correct: false, deltas: true } },
    { stage: 'deltas', hidden: { tally: false, correct: false, deltas: false } },
    { stage: 'complete', hidden: { tally: false, correct: false, deltas: false } }
  ])('keeps unrevealed content out of the accessibility tree at $stage', ({ stage, hidden }) => {
    renderStage(stage);
    expectStageHidden('tally', hidden.tally);
    expectStageHidden('correct', hidden.correct);
    expectStageHidden('deltas', hidden.deltas);
  });

  it('keeps tally labels neutral until the truth reveal', () => {
    renderStage('tally');
    expect([...document.querySelectorAll('.breakdown-kind')].map((node) => node.textContent)).toEqual([
      'Answer',
      'Answer'
    ]);
    expect(document.querySelectorAll('.breakdown-row.correct')).toHaveLength(0);

    renderStage('correct');
    expect([...document.querySelectorAll('.breakdown-kind')].map((node) => node.textContent)).toEqual([
      'Correct answer',
      'Fake by Cy'
    ]);
    expect(document.querySelectorAll('.breakdown-row.correct')).toHaveLength(1);
  });
});
