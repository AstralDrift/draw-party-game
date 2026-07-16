import { useGame } from '../../app/GameProvider';
import { finalWinnerText, podiumTitles, roundOutcomeText } from '../../polish';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Shell } from '../../components/ui/Shell';

export function PlayerResults(): React.JSX.Element {
  const { snapshot } = useGame();
  const result = snapshot?.roundResult;

  return (
    <Shell title="Results">
      <GlassPanel>
        <p className="eyebrow">Results</p>
        <h2>{result ? roundOutcomeText(result) : 'Round results'}</h2>
        {result ? (
          <>
            <p className="prompt">Answer: {result.correctAnswer}</p>
            <div>
              {result.scoreDeltas.map((delta) => (
                <div key={delta.playerId} className="score-row">
                  <span>{delta.name}</span>
                  <span className="pill">
                    {delta.delta >= 0 ? '+' : ''}
                    {delta.delta}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Watch the TV for the reveal.</p>
        )}
      </GlassPanel>
    </Shell>
  );
}

export function PlayerFinal(): React.JSX.Element {
  const { snapshot } = useGame();
  const scores = snapshot?.finalScores ?? [];
  const titles = podiumTitles(scores);
  const titleFor = (playerId: string) => titles.find((item) => item.playerId === playerId)?.title;

  return (
    <Shell title="Final Scores">
      <GlassPanel>
        <p className="eyebrow">Final Scores</p>
        <h2>{finalWinnerText(scores)}</h2>
        {scores.map((entry, index) => (
          <div key={entry.playerId} className="score-row">
            <span>
              #{index + 1} {entry.name}
              {titleFor(entry.playerId) ? ` · ${titleFor(entry.playerId)}` : ''}
            </span>
            <span className="pill">{entry.score} pts</span>
          </div>
        ))}
      </GlassPanel>
    </Shell>
  );
}
