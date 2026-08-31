/**
 * @vitest-environment happy-dom
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RoundResult } from '../../protocol';
import type { RevealStage } from '../../hooks/useRevealStage';
import { groupScoreEvents, ResultsPanel, scoreEventText } from './ResultsPanel';

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
      voterNames: ['Di', 'Eli'],
      isCorrect: false,
      authorName: 'Cy'
    }
  ],
  scoreDeltas: [
    { playerId: 'bo', name: 'Bo', delta: 200, scoreAfter: 450 },
    { playerId: 'artist', name: 'Ari', delta: 100, scoreAfter: 100 },
    { playerId: 'cy', name: 'Cy', delta: 100, scoreAfter: 300 }
  ],
  scoreEvents: [
    {
      kind: 'foundTruth',
      playerId: 'bo',
      name: 'Bo',
      points: 200,
      relatedPlayerId: 'artist',
      relatedPlayerName: 'Ari'
    },
    {
      kind: 'artistClarity',
      playerId: 'artist',
      name: 'Ari',
      points: 100,
      relatedPlayerId: 'bo',
      relatedPlayerName: 'Bo'
    },
    {
      kind: 'fooledPlayer',
      playerId: 'cy',
      name: 'Cy',
      points: 50,
      relatedPlayerId: 'di',
      relatedPlayerName: 'Di'
    },
    {
      kind: 'fooledPlayer',
      playerId: 'cy',
      name: 'Cy',
      points: 50,
      relatedPlayerId: 'eli',
      relatedPlayerName: 'Eli'
    }
  ],
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
    { stage: 'correct', hidden: { tally: true, correct: false, deltas: true } },
    { stage: 'deltas', hidden: { tally: true, correct: true, deltas: false } },
    { stage: 'complete', hidden: { tally: true, correct: true, deltas: false } }
  ])('keeps unrevealed content out of the accessibility tree at $stage', ({ stage, hidden }) => {
    renderStage(stage);
    expectStageHidden('tally', hidden.tally);
    expectStageHidden('correct', hidden.correct);
    expectStageHidden('deltas', hidden.deltas);
  });

  it('keeps tally labels neutral until the truth reveal', () => {
    renderStage('tally');
    expect(document.querySelectorAll('.breakdown-kind')).toHaveLength(0);
    expect(document.querySelectorAll('.breakdown-row.correct')).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Fake by Cy');
    expect(document.body.textContent).not.toContain('Option A');
    expect(document.body.textContent).not.toContain('Voted by');
    expect(document.body.textContent).not.toContain('No votes');
    expect(document.querySelectorAll('.vote-chip')).toHaveLength(0);

    renderStage('correct');
    expect(document.querySelector('.breakdown')?.getAttribute('aria-hidden')).toBe('true');
    expect([...document.querySelectorAll('.breakdown-kind')].map((node) => node.textContent)).toEqual([
      'Correct answer',
      'Fake by Cy'
    ]);
    expect(document.querySelectorAll('.breakdown-row.correct')).toHaveLength(1);
  });

  it('lets the drawing and the prompt own their beats', () => {
    document.body.innerHTML = renderToStaticMarkup(
      <ResultsPanel result={result} drawing={null} stage="hold" includeDrawing />
    );
    expect(document.querySelector('.reveal-hold-line')).toBeNull();
    expect(document.querySelector('.result-summary .eyebrow')).toBeNull();
    expect(document.querySelector('.result-canvas')?.className.includes('is-visible')).toBe(true);
    expect(document.querySelector('.reveal-prompt')?.className.includes('is-visible')).toBe(false);

    document.body.innerHTML = renderToStaticMarkup(
      <ResultsPanel result={result} drawing={null} stage="correct" includeDrawing />
    );
    const summary = document.querySelector('.result-summary');
    expect(summary?.querySelector('h2')).toBeNull();
    expect(summary?.querySelector('.eyebrow')).toBeNull();
    expect(summary?.querySelector('.reveal-prompt')?.textContent).toBe('A moon taking a bath');
    expect(summary?.querySelector('.round-outcome')).toBeNull();
    expect(document.querySelector('.score-deltas')?.getAttribute('aria-hidden')).toBe('true');

    document.body.innerHTML = renderToStaticMarkup(
      <ResultsPanel result={result} drawing={null} stage="deltas" includeDrawing />
    );
    expect(document.querySelector('.result-summary')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.reveal-prompt')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.score-deltas')?.getAttribute('aria-hidden')).toBe('false');
    expect(document.querySelector('.result-summary .eyebrow')).toBeNull();
    expect(document.querySelector('.round-outcome')?.textContent).toBe('Bo cracked it');
  });

  it('shows the drawing only on the hold beat', () => {
    const stages: RevealStage[] = ['hold', 'tally', 'correct', 'deltas', 'complete'];
    for (const stage of stages) {
      document.body.innerHTML = renderToStaticMarkup(
        <ResultsPanel result={result} drawing={null} stage={stage} includeDrawing />
      );
      const canvas = document.querySelector('.result-canvas');
      expect(canvas).not.toBeNull();
      expect(canvas?.className.includes('is-visible')).toBe(stage === 'hold');
    }
  });

  it('renders the intended TV columns, stable labels, stagger variables, and one announcement', () => {
    document.body.innerHTML = renderToStaticMarkup(
      <ResultsPanel
        result={result}
        drawing={null}
        stage="tally"
        includeDrawing
        controls={<button type="button">Continue</button>}
      />
    );

    expect(document.querySelector('.result-summary')).not.toBeNull();
    expect(document.querySelector('.result-sidebar')).not.toBeNull();
    expect([...document.querySelectorAll('.breakdown-row')].map((node) => node.getAttribute('data-option-label'))).toEqual([
      'A',
      'B'
    ]);
    expect(document.querySelectorAll('.option-stagger')[1]?.getAttribute('style')).toContain(
      '--option-delay:120ms'
    );
    expect(document.querySelector('.result-controls')?.textContent).toBe('Continue');
    expect(document.querySelectorAll('[role="status"][aria-live="polite"]')).toHaveLength(1);
  });

  it('groups server-authored causal awards and shows authoritative totals', () => {
    const events = groupScoreEvents(result.scoreEvents ?? []);
    expect(events).toHaveLength(3);
    const fooled = events.find((event) => event.kind === 'fooledPlayer');
    expect(fooled).toMatchObject({ points: 100, relatedPlayerNames: ['Di', 'Eli'] });
    expect(fooled ? scoreEventText(fooled) : '').toBe('Cy fooled Di and Eli');

    renderStage('deltas');
    expect(document.body.textContent).toContain('Bo found the truth');
    expect(document.body.textContent).toContain('Ari helped Bo find the truth');
    expect(document.body.textContent).toContain('Cy fooled Di and Eli');
    expect([...document.querySelectorAll('.score-total')].map((node) => node.textContent)).toEqual([
      'Bo 450 total',
      'Ari 100 total',
      'Cy 300 total'
    ]);
  });

  it('falls back to aggregate deltas from an older server', () => {
    const legacy = { ...result, scoreEvents: undefined };
    document.body.innerHTML = renderToStaticMarkup(
      <ResultsPanel result={legacy} drawing={null} stage="deltas" includeDrawing={false} />
    );
    expect(document.body.textContent).toContain('Bo +200 · 450 total');
  });

  it('labels practice clearly and suppresses result confetti', () => {
    document.body.innerHTML = renderToStaticMarkup(
      <ResultsPanel result={result} drawing={null} stage="correct" includeDrawing practice />
    );
    expect(document.querySelector('.result-summary .eyebrow')).toBeNull();
    expect(document.querySelector('.round-outcome')).toBeNull();
    expect(document.body.textContent).toContain('A moon taking a bath');
    expect(document.body.textContent).not.toContain('artist wins the room');

    document.body.innerHTML = renderToStaticMarkup(
      <ResultsPanel result={result} drawing={null} stage="complete" includeDrawing practice />
    );
    expect(document.body.textContent).toContain('Practice round — scores stay off.');
    expect(document.body.textContent).not.toContain('Warm-up complete');
    expect(document.querySelector('.confetti')).toBeNull();
    expect(document.querySelector('.result-summary .eyebrow')).toBeNull();
  });
});
