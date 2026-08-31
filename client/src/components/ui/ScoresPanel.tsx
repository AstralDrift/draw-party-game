import type { ReactNode } from 'react';
import { competitionRank, finalWinnerText, ordinalRank, podiumTitles } from '../../polish';
import type { ClientRole } from '../../app/GameProvider';
import type { ScoreEntry } from '../../protocol';
import { exportShareCard, podiumShareLabel } from '../../share-card';
import { Button } from './Button';
import { Confetti } from './Confetti';
import { GlassPanel } from './GlassPanel';

interface ScoresPanelProps {
  scores: ScoreEntry[];
  podium: boolean;
  role: ClientRole;
  practice?: boolean;
  onShareFailed?: () => void;
  actions?: ReactNode;
  shareReady?: boolean;
}

export function ScoresPanel({
  scores,
  podium,
  role,
  practice = false,
  onShareFailed,
  actions,
  shareReady = false
}: ScoresPanelProps): React.JSX.Element {
  const showPodium = podium && !practice;
  const topScores = showPodium
    ? scores.filter((score) => competitionRank(scores, score) <= 3)
    : [];
  const winner = scores[0];
  const listedScores = practice
    ? []
    : podium
      ? scores.filter((score) => competitionRank(scores, score) > 3)
      : scores;
  const titles = new Map(podiumTitles(scores).map((entry) => [entry.playerId, entry.title]));
  const shareLabel = podiumShareLabel();
  const displayShareFallback = role === 'display';
  const showShare = showPodium && displayShareFallback && shareReady;

  return (
    <GlassPanel className="scores-panel" id="scores-panel">
      {showPodium ? <Confetti variant="final" /> : null}
      {practice ? (
        <div className="winner-callout">
          <p className="eyebrow">Practice · scores off</p>
          <h2>Warm-up complete</h2>
        </div>
      ) : podium ? (
        <div className="winner-callout">
          <h2>{finalWinnerText(scores)}</h2>
          {role === 'player' && winner ? <span className="pill">{winner.score} pts</span> : null}
        </div>
      ) : null}
      {showPodium ? (
        <div className={`podium${topScores.length > 3 ? ' is-crowded' : ''}`}>
          {topScores.map((score) => {
            const rank = competitionRank(scores, score);
            return (
              <div key={score.playerId} className={`podium-place place-${rank}`}>
                <span className="podium-rank">{ordinalRank(rank)}</span>
                <strong>{score.name}</strong>
                <span className="podium-title">{titles.get(score.playerId) ?? ''}</span>
                <span>{score.score} pts</span>
              </div>
            );
          })}
        </div>
      ) : null}
      {listedScores.length > 0 ? (
        <div className="score-list">
          {listedScores.map((score) => {
            const title = titles.get(score.playerId);
            const rank = competitionRank(scores, score);
            return (
              <div
                key={score.playerId}
                className={`score-row ${rank === 1 ? 'winner' : ''}`}
              >
                <span>
                  {rank}. {score.name}
                  {title ? ` · ${title}` : ''}
                </span>
                <span className="pill">{score.score} pts</span>
              </div>
            );
          })}
        </div>
      ) : null}
      {actions || showShare ? (
        <div className="tv-finale-actions">
          {actions}
          {showShare ? (
            <Button
              variant="ghost"
              className="tv-action-fallback share-card-button"
              aria-label={`${shareLabel} from TV (fallback)`}
              onClick={() => {
                void exportShareCard(scores).then((result) => {
                  if (result === 'failed') {
                    onShareFailed?.();
                  }
                });
              }}
            >
              {shareLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </GlassPanel>
  );
}
