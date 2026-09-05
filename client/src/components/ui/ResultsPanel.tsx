import type { CSSProperties, ReactNode } from 'react';
import { roundOutcomeText } from '../../polish';
import type { DrawingDoc, ResultPresentation, RoundResult, ScoreEntry, ScoreEvent } from '../../protocol';
import { ShowResults } from './ShowResults';
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
  presentation?: ResultPresentation | null;
  scores?: ScoreEntry[];
  playerIds?: string[];
}

export interface GroupedScoreEvent extends ScoreEvent {
  relatedPlayerNames: string[];
}

function stageClass(stage: RevealStage, target: RevealStage): string {
  const visible = stageVisible(stage, target) ? ' is-visible' : '';
  return `reveal-stage reveal-stage-${target}${visible}`;
}

function drawingStageClass(stage: RevealStage): string {
  const visible = stage === 'hold' ? ' is-visible' : '';
  return `reveal-stage reveal-stage-drawing${visible}`;
}

function revealAnnouncement(stage: RevealStage, result: RoundResult, practice: boolean): string {
  switch (stage) {
    case 'hold':
      return 'Votes locked in.';
    case 'tally':
      return 'The answer choices are in.';
    case 'spotlight':
      return 'The most convincing fake.';
    case 'correct':
      return `The real prompt was ${result.correctAnswer}.`;
    case 'deltas':
      return practice
        ? 'Practice round. Scores stay off.'
        : `${roundOutcomeText(result)}. Scores updated.`;
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
  practice = false,
  presentation,
  scores,
  playerIds
}: ResultsPanelProps): React.JSX.Element {
  if (presentation && includeDrawing) {
    return <ShowResults result={result} drawing={drawing} presentation={presentation}
      stage={stage} practice={practice} controls={controls} scores={scores} playerIds={playerIds} />;
  }
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
        {revealAnnouncement(stage, result, practice)}
      </p>

      <div className="result-summary" aria-hidden={stage !== 'hold' && stage !== 'correct'}>
        {includeDrawing ? (
          <DrawingCanvas
            drawing={drawing}
            className={`reveal-canvas result-canvas ${drawingStageClass(stage)}`}
          />
        ) : null}
        <div
          className={`prompt reveal-prompt ${stageClass(stage, 'correct')}`}
          aria-hidden={stage !== 'correct'}
        >
          {result.correctAnswer}
        </div>
      </div>

      <div className="result-sidebar">
        <div
          className={`breakdown ${stageClass(stage, 'tally')}`}
          aria-hidden={stage !== 'tally'}
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
                  {truthVisible ? (
                    <div className="breakdown-kind">
                      {item.isCorrect
                        ? 'Correct answer'
                        : item.authorName
                          ? `Fake by ${item.authorName}`
                          : 'Fake answer'}
                    </div>
                  ) : null}
                  <div className="breakdown-answer">{item.optionText}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`${stageClass(stage, 'deltas')} score-deltas`}
          aria-hidden={!scoresVisible}
        >
          {practice ? (
            <div className="score-event causal-score-event">Practice round — scores stay off.</div>
          ) : (
            <>
              <p className="round-outcome">{roundOutcomeText(result)}</p>
              {groupedEvents.length > 0 ? (
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
              {groupedEvents.length > 0 && activeDeltas.length > 0 ? (
                <div className="current-totals" aria-label="Current totals">
                  {activeDeltas.map((delta) => (
                    <span key={delta.playerId} className="pill score-total">
                      {delta.name} {delta.scoreAfter === undefined ? `+${delta.delta}` : `${delta.scoreAfter} total`}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        {controls ? <div className="result-controls">{controls}</div> : null}
        {showReactions ? <ReactionBar /> : null}
      </div>
    </GlassPanel>
  );
}
