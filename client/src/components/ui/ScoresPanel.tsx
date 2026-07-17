import { finalWinnerText, podiumTitles } from '../../polish';
import type { ClientRole } from '../../app/GameProvider';
import type { ScoreEntry } from '../../protocol';
import { exportShareCard } from '../../share-card';
import { Button } from './Button';
import { Confetti } from './Confetti';
import { GlassPanel } from './GlassPanel';

interface ScoresPanelProps {
  scores: ScoreEntry[];
  podium: boolean;
  role: ClientRole;
  onShareFailed?: () => void;
}

function podiumRank(index: number): string {
  return ['1st', '2nd', '3rd'][index] ?? `${index + 1}th`;
}

export function ScoresPanel({
  scores,
  podium,
  role,
  onShareFailed
}: ScoresPanelProps): React.JSX.Element {
  const topScores = podium ? scores.slice(0, 3) : [];
  const winner = scores[0];
  const listedScores = podium && role === 'player' ? scores.slice(3) : scores;
  const rankOffset = podium && role === 'player' ? 3 : 0;
  const titles = new Map(podiumTitles(scores).map((entry) => [entry.playerId, entry.title]));

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
        <div className="podium">
          {topScores.map((score, index) => (
            <div key={score.playerId} className={`podium-place place-${index + 1}`}>
              <span className="podium-rank">{podiumRank(index)}</span>
              <strong>{score.name}</strong>
              <span className="podium-title">{titles.get(score.playerId) ?? ''}</span>
              <span>{score.score} pts</span>
            </div>
          ))}
        </div>
      ) : null}
      {listedScores.length > 0 ? (
        <div className="score-list">
          {listedScores.map((score, index) => {
            const title = titles.get(score.playerId);
            return (
              <div
                key={score.playerId}
                className={`score-row ${rankOffset + index === 0 ? 'winner' : ''}`}
              >
                <span>
                  {rankOffset + index + 1}. {score.name}
                  {title ? ` · ${title}` : ''}
                </span>
                <span className="pill">{score.score} pts</span>
              </div>
            );
          })}
        </div>
      ) : null}
      {podium && role === 'display' ? (
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
          Share Podium Card
        </Button>
      ) : null}
    </GlassPanel>
  );
}
