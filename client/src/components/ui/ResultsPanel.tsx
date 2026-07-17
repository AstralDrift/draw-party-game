import { roundOutcomeText } from '../../polish';
import type { DrawingDoc, RoundResult } from '../../protocol';
import { stageVisible, type RevealStage } from '../../hooks/useRevealStage';
import { Confetti } from './Confetti';
import { DrawingCanvas } from './DrawingPadHost';
import { GlassPanel } from './GlassPanel';
import { ReactionBar } from './ReactionBar';

interface ResultsPanelProps {
  result: RoundResult;
  drawing: DrawingDoc | null | undefined;
  stage: RevealStage;
  includeDrawing: boolean;
  showReactions?: boolean;
}

function stageClass(stage: RevealStage, target: RevealStage): string {
  const visible = stageVisible(stage, target) ? ' is-visible' : '';
  return `reveal-stage reveal-stage-${target}${visible}`;
}

/** Hold beat is exclusive — hide once tally/correct starts so TV results stay readable. */
function holdStageClass(stage: RevealStage): string {
  const visible = stage === 'hold' ? ' is-visible' : '';
  return `reveal-stage reveal-stage-hold${visible}`;
}

function drawingStageClass(stage: RevealStage): string {
  const visible = stageVisible(stage, 'hold') || stage === 'complete' ? ' is-visible' : '';
  return `reveal-stage reveal-stage-drawing${visible}`;
}

export function ResultsPanel({
  result,
  drawing,
  stage,
  includeDrawing,
  showReactions = false
}: ResultsPanelProps): React.JSX.Element {
  const activeDeltas = result.scoreDeltas.filter((delta) => delta.delta > 0);
  const showConfetti =
    includeDrawing && (stage === 'correct' || stage === 'deltas' || stage === 'complete');

  return (
    <GlassPanel
      className={`results-panel ${includeDrawing ? 'display-results' : 'player-results'}`}
      data-reveal-root="true"
      data-reveal-stage={stage}
    >
      {showConfetti ? <Confetti variant="result" /> : null}
      <p className="eyebrow">Drawing by {result.artistName}</p>
      <div className={holdStageClass(stage)}>
        <p className="reveal-hold-line">Votes locked in…</p>
      </div>
      <div className={`round-outcome ${stageClass(stage, 'correct')}`}>{roundOutcomeText(result)}</div>
      <h2 className={stageClass(stage, 'correct')}>The real prompt was</h2>
      <div className={`prompt reveal-prompt ${stageClass(stage, 'correct')}`}>{result.correctAnswer}</div>
      {includeDrawing ? (
        <DrawingCanvas
          drawing={drawing}
          className={`reveal-canvas result-canvas ${drawingStageClass(stage)}`}
        />
      ) : null}
      <div className={`${stageClass(stage, 'deltas')} score-deltas${activeDeltas.length === 0 ? ' muted' : ''}`}>
        {activeDeltas.length === 0
          ? 'No points this reveal.'
          : activeDeltas.map((delta) => (
              <span key={delta.playerId} className="pill score-delta">
                {delta.name} +{delta.delta}
              </span>
            ))}
      </div>
      <div className={`breakdown ${stageClass(stage, 'tally')}`}>
        {result.breakdown.map((item) => (
          <div key={item.optionId} className={`breakdown-row ${item.isCorrect ? 'correct' : ''}`}>
            <div className="breakdown-kind">
              {item.isCorrect
                ? 'Correct answer'
                : item.authorName
                  ? `Fake by ${item.authorName}`
                  : 'Fake answer'}
            </div>
            <div className="breakdown-answer">{item.optionText}</div>
            {item.voterNames.length === 0 ? (
              <div className="muted">No votes</div>
            ) : (
              <div className="chip-row">
                <span className="chip-label">Voted by</span>
                {item.voterNames.map((name) => (
                  <span key={name} className="pill vote-chip">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {showReactions ? <ReactionBar /> : null}
    </GlassPanel>
  );
}
