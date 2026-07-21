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
  onShareFailed?: () => void;
}

export function ScoresPanel({
  scores,
  podium,
  role,
  onShareFailed
}: ScoresPanelProps): React.JSX.Element {
  const topScores = podium
    ? scores.filter((score) => competitionRank(scores, score) <= 3)
    : [];
  const winner = scores[0];
  const listedScores = podium
    ? scores.filter((score) => competitionRank(scores, score) > 3)
    : scores;
  const titles = new Map(podiumTitles(scores).map((entry) => [entry.playerId, entry.title]));
  const shareLabel = podiumShareLabel();

  return (
    <GlassPanel className="scores-panel" id="scores-panel">
      {podium ? <Confetti variant="final" /> : null}
      {podium ? (
        <div className="winner-callout">
          {role === 'player' ? <p className="eyebrow">Champion</p> : null}
          <h2>{finalWinnerText(scores)}</h2>
          {role === 'player' && winner ? <span className="pill">{winner.score} pts</span> : null}
        </div>
      ) : null}
      <div className="panel-title">{podium ? 'Final Podium' : 'Scores'}</div>
      {podium ? (
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
      {podium ? (
        <Button
          variant="secondary"
          wide
          className="tool-button share-card-button"
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
    </GlassPanel>
  );
}
