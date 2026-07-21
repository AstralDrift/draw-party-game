import type { CSSProperties, ReactNode } from 'react';
import { roundOutcomeText } from '../../polish';
import type { DrawingDoc, RoundResult, ScoreEvent } from '../../protocol';
import {
  OPTION_STAGGER_MS,
  stageVisible,
  type RevealStage
} from '../../hooks/useRevealStage';
import { optionLabel } from '../../option-label';
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
  controls?: ReactNode;
  practice?: boolean;
}

export interface GroupedScoreEvent extends ScoreEvent {
  relatedPlayerNames: string[];
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

function revealAnnouncement(stage: RevealStage, result: RoundResult): string {
  switch (stage) {
    case 'hold':
      return 'Votes locked in.';
    case 'tally':
      return 'The answer choices are in.';
    case 'correct':
      return `The real prompt was ${result.correctAnswer}.`;
    case 'deltas':
      return 'Scores updated.';
    case 'complete':
      return 'Reveal complete.';
  }
}

function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** Group repeated server-authored awards for concise TV copy without recreating score rules. */
export function groupScoreEvents(events: ScoreEvent[]): GroupedScoreEvent[] {
  const grouped = new Map<string, GroupedScoreEvent>();
  for (const event of events) {
    const key = `${event.kind}:${event.playerId}`;
    const existing = grouped.get(key);
    const relatedName = event.relatedPlayerName?.trim();
    if (existing) {
      existing.points += event.points;
      if (relatedName && !existing.relatedPlayerNames.includes(relatedName)) {
        existing.relatedPlayerNames.push(relatedName);
      }
      continue;
    }
    grouped.set(key, {
      ...event,
      relatedPlayerNames: relatedName ? [relatedName] : []
    });
  }
  return [...grouped.values()];
}

export function scoreEventText(event: GroupedScoreEvent): string {
  const related = joinNames(event.relatedPlayerNames);
  switch (event.kind) {
    case 'foundTruth':
      return `${event.name} found the truth`;
    case 'artistClarity':
      return related
        ? `${event.name} helped ${related} find the truth`
        : `${event.name}'s drawing came through`;
    case 'fooledPlayer':
      return related ? `${event.name} fooled ${related}` : `${event.name} sold the fake`;
    case 'nobodyFoundIt':
      return `${event.name} stumped everyone`;
    case 'perfectTruth':
      return `${event.name} drew it crystal clear`;
  }
}

export function ResultsPanel({
  result,
  drawing,
  stage,
  includeDrawing,
  showReactions = false,
  controls,
  practice = false
}: ResultsPanelProps): React.JSX.Element {
  const activeDeltas = result.scoreDeltas.filter((delta) => delta.delta > 0);
  const groupedEvents = groupScoreEvents(result.scoreEvents ?? []);
  const truthVisible = stageVisible(stage, 'correct');
  const scoresVisible = stageVisible(stage, 'deltas');
  const showConfetti =
    !practice && includeDrawing && (stage === 'correct' || stage === 'deltas' || stage === 'complete');

  return (
    <GlassPanel
      className={`results-panel ${includeDrawing ? 'display-results' : 'player-results'}`}
      data-reveal-root="true"
      data-reveal-stage={stage}
    >
      {showConfetti ? <Confetti variant="result" /> : null}
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {revealAnnouncement(stage, result)}
      </p>

      <div className="result-summary">
        <p className="eyebrow">
          {practice ? 'Practice · scores off' : `Drawing by ${result.artistName}`}
        </p>
        <div className={holdStageClass(stage)} aria-hidden={stage !== 'hold'}>
          <p className="reveal-hold-line">Votes locked in…</p>
        </div>
        <div
          className={`round-outcome ${stageClass(stage, 'correct')}`}
          aria-hidden={!truthVisible}
        >
          {practice ? 'Warm-up complete' : roundOutcomeText(result)}
        </div>
        <h2 className={stageClass(stage, 'correct')} aria-hidden={!truthVisible}>
          The real prompt was
        </h2>
        <div
          className={`prompt reveal-prompt ${stageClass(stage, 'correct')}`}
          aria-hidden={!truthVisible}
        >
          {result.correctAnswer}
        </div>
        {includeDrawing ? (
          <DrawingCanvas
            drawing={drawing}
            className={`reveal-canvas result-canvas ${drawingStageClass(stage)}`}
          />
        ) : null}
      </div>

      <div className="result-sidebar">
        <div
          className={`breakdown ${stageClass(stage, 'tally')}`}
          aria-hidden={!stageVisible(stage, 'tally')}
        >
          {result.breakdown.map((item, index) => {
            const label = optionLabel(index);
            const staggerStyle = {
              '--option-index': index,
              '--option-delay': `${index * OPTION_STAGGER_MS}ms`
            } as CSSProperties;
            return (
              <div
                key={item.optionId}
                className={`breakdown-row option-stagger${truthVisible && item.isCorrect ? ' correct' : ''}`}
                data-option-label={label}
                style={staggerStyle}
              >
                <span className="option-label" aria-hidden="true">
                  {label}
                </span>
                <div className="breakdown-copy">
                  <div className="breakdown-kind">
                    {truthVisible
                      ? item.isCorrect
                        ? 'Correct answer'
                        : item.authorName
                          ? `Fake by ${item.authorName}`
                          : 'Fake answer'
                      : `Option ${label}`}
                  </div>
                  <div className="breakdown-answer">{item.optionText}</div>
                  {item.voterNames.length > 0 ? (
                    <div className="chip-row">
                      <span className="chip-label">Voted by</span>
                      {item.voterNames.map((name, voterIndex) => (
                        <span key={`${name}:${voterIndex}`} className="pill vote-chip">
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="muted">No votes</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`${stageClass(stage, 'deltas')} score-deltas${activeDeltas.length === 0 ? ' muted' : ''}`}
          aria-hidden={!scoresVisible}
        >
          {practice ? (
            <div className="score-event causal-score-event">Practice round — scores stay off.</div>
          ) : groupedEvents.length > 0 ? (
            <div className="score-events">
              {groupedEvents.map((event) => (
                <div key={`${event.kind}:${event.playerId}`} className="score-event causal-score-event">
                  <span>{scoreEventText(event)}</span>
                  <span className="pill score-delta">+{event.points}</span>
                </div>
              ))}
            </div>
          ) : activeDeltas.length === 0 ? (
            'No points this reveal.'
          ) : (
            activeDeltas.map((delta) => (
              <span key={delta.playerId} className="pill score-delta">
                {delta.name} +{delta.delta}
                {delta.scoreAfter === undefined ? '' : ` · ${delta.scoreAfter} total`}
              </span>
            ))
          )}
          {!practice && groupedEvents.length > 0 && activeDeltas.length > 0 ? (
            <div className="current-totals" aria-label="Current totals">
              {activeDeltas.map((delta) => (
                <span key={delta.playerId} className="pill score-total">
                  {delta.name} {delta.scoreAfter === undefined ? `+${delta.delta}` : `${delta.scoreAfter} total`}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {controls ? <div className="result-controls">{controls}</div> : null}
        {showReactions ? <ReactionBar /> : null}
      </div>
    </GlassPanel>
  );
}
