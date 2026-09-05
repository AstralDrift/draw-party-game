import type { ReactNode } from 'react';
import type { DrawingDoc, ResultPresentation, RoundResult, ScoreEntry } from '../../protocol';
import type { RevealStage } from '../../hooks/useRevealStage';
import { roundOutcomeText } from '../../polish';
import { optionLabel } from '../../option-label';
import { revealStandings } from '../../results';
import { DrawingCanvas } from './DrawingPadHost';
import { GlassPanel } from './GlassPanel';
import { Confetti } from './Confetti';
import { playerAccentSlot } from './PlayerList';
import { ShowDoodle } from './ShowDoodle';

interface ShowResultsProps {
  result: RoundResult;
  drawing: DrawingDoc | null | undefined;
  presentation: ResultPresentation;
  stage: RevealStage;
  practice: boolean;
  controls?: ReactNode;
  scores?: ScoreEntry[];
}

export function ShowResults({ result, drawing, presentation, stage, practice, controls, scores }: ShowResultsProps) {
  const spotlight = result.breakdown.find((option) => option.optionId === presentation.spotlightOptionId);
  const standings = revealStandings(result, scores);
  const scoring = stage === 'deltas' || stage === 'complete';
  const announcement = stage === 'spotlight' && spotlight
    ? `${spotlight.optionText}. A fake by ${spotlight.authorName}. Fooled ${spotlight.voterNames.join(', ')}.`
    : stage === 'correct' ? `The real prompt was ${result.correctAnswer}. Drawing by ${result.artistName}.`
      : scoring ? practice ? 'Practice complete. Scores stay off.' : `${roundOutcomeText(result)}. Scores updated.`
        : stage === 'tally' ? 'Here is where the votes went.' : 'Votes locked in.';

  return (
    <GlassPanel className="results-panel display-results show-results" data-reveal-root="true" data-reveal-stage={stage}>
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      {!practice && stage === 'correct' ? <Confetti variant="result" /> : null}
      {stage === 'hold' ? (
        <div className="show-art-beat">
          <span className="show-eyebrow">Votes locked. Pencils down.</span>
          <DrawingCanvas drawing={drawing} className="reveal-canvas result-canvas" />
        </div>
      ) : null}
      {stage === 'tally' ? (
        <div className="show-tally">
          <h2>Place your regrets.</h2>
          <div className="show-ballot breakdown">
            {result.breakdown.map((option, index) => (
              <div className="show-ballot-row" key={option.optionId} data-option-label={optionLabel(index)}>
                <span className="option-label">{optionLabel(index)}</span>
                <span className="breakdown-answer">{option.optionText}</span>
                <span className="show-vote-count" aria-label={`${option.voterNames.length} votes`}>{option.voterNames.length}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {stage === 'spotlight' && spotlight ? (
        <div className="show-spotlight">
          <ShowDoodle />
          <span className="show-eyebrow">The room bought this one</span>
          <h2 className="show-fake-title">{spotlight.optionText}</h2>
          <div className="show-fake-credit"><span className="fake-stamp">FAKE</span><span>by {spotlight.authorName}</span></div>
          <p className="show-fooled"><span>Fooled</span> {spotlight.voterNames.join(' · ')}</p>
        </div>
      ) : null}
      {stage === 'correct' ? (
        <div className="show-truth">
          <DrawingCanvas drawing={drawing} className="reveal-canvas result-canvas" />
          <div className="show-truth-copy">
            <span className="show-eyebrow">The actual masterpiece</span>
            <h2 className="prompt reveal-prompt">{result.correctAnswer}</h2>
            <p>by {result.artistName}</p>
          </div>
        </div>
      ) : null}
      {scoring ? (
        <div className="show-scores">
          <h2 className="round-outcome">{practice ? 'A masterpiece in the making.' : roundOutcomeText(result)}</h2>
          {practice ? <p>Practice round — scores stay off.</p> : (
            <ol className={`show-standings${standings.length > 4 ? ' is-full' : ''}`} aria-label="Current standings">
              {standings.map((score) => (
                <li key={score.playerId} className="show-score-row" data-player-slot={playerAccentSlot(score.playerId)}>
                  <span className="show-rank">{score.rank}</span>
                  <strong>{score.name}</strong>
                  <span className="rank-movement" aria-label={score.movement > 0 ? `Up ${score.movement} places` : score.movement < 0 ? `Down ${-score.movement} places` : 'Rank unchanged'}>
                    {score.movement > 0 ? `↑${score.movement}` : score.movement < 0 ? `↓${-score.movement}` : '—'}
                  </span>
                  <span className="score-delta">{score.delta > 0 ? `+${score.delta}` : '—'}</span>
                  <span className="show-score-total">{score.score}<small>pts</small></span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
      {controls ? <div className="show-controls">{controls}</div> : null}
    </GlassPanel>
  );
}
