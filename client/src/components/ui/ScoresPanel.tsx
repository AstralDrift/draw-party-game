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
}

export function ScoresPanel({
  scores,
  podium,
  role,
  practice = false,
  onShareFailed
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
          {role === 'player' ? <p className="eyebrow">Champion</p> : null}
          <h2>{finalWinnerText(scores)}</h2>
          {role === 'player' && winner ? <span className="pill">{winner.score} pts</span> : null}
        </div>
      ) : null}
      <div className="panel-title">{practice ? 'Practice complete' : podium ? 'Final Podium' : 'Scores'}</div>
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
      {showPodium ? (
        <Button
          variant={displayShareFallback ? 'ghost' : 'secondary'}
          wide={!displayShareFallback}
          className={`${displayShareFallback ? 'tv-action-fallback' : 'tool-button'} share-card-button`}
          onClick={() => {
            void exportShareCard(scores).then((result) => {
              if (result === 'failed') {
                onShareFailed?.();
              }
            });
          }}
        >
          {displayShareFallback ? `${shareLabel} from TV (fallback)` : shareLabel}
        </Button>
      ) : null}
    </GlassPanel>
  );
}
