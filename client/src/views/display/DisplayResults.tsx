import { useGame } from '../../app/GameProvider';
import { finalWinnerText, podiumTitles, roundOutcomeText } from '../../polish';
import { Button } from '../../components/ui/Button';
import { DrawingCanvas } from '../../components/ui/DrawingPadHost';
import { GlassPanel } from '../../components/ui/GlassPanel';

export function DisplayResults(): React.JSX.Element {
  const { snapshot, send } = useGame();
  const result = snapshot?.roundResult;
  if (!snapshot) {
    return <GlassPanel />;
  }

  return (
    <div className="display-grid display-grid-results">
      <GlassPanel>
        <p className="eyebrow">Results</p>
        <h2>{result ? roundOutcomeText(result) : 'Round results'}</h2>
        {result ? (
          <>
            <p className="prompt">Answer: {result.correctAnswer}</p>
            <DrawingCanvas drawing={snapshot.currentDrawing} />
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
        ) : null}
      </GlassPanel>
      <GlassPanel className="advance-panel" tone="soft">
        <p className="eyebrow">Next reveal</p>
        <Button
          id="advance-button"
          className="spotlight-button"
          wide
          onClick={() => send({ type: 'startGame' })}
        >
          Continue
        </Button>
        {snapshot.deadlineMs ? (
          <p className="muted">Auto-continues when the timer hits zero.</p>
        ) : null}
      </GlassPanel>
    </div>
  );
}

export function DisplayFinal(): React.JSX.Element {
  const { snapshot, send } = useGame();
  if (!snapshot) {
    return <GlassPanel />;
  }
  const scores = snapshot.finalScores;
  const titles = podiumTitles(scores);
  const titleFor = (playerId: string) => titles.find((item) => item.playerId === playerId)?.title;

  return (
    <div className="display-grid display-grid-finalScores">
      <GlassPanel>
        <p className="eyebrow">Final Scores</p>
        <h2>{finalWinnerText(scores)}</h2>
        <div>
          {scores.map((entry, index) => (
            <div key={entry.playerId} className="score-row player-row">
              <span>
                #{index + 1} {entry.name}
                {titleFor(entry.playerId) ? ` · ${titleFor(entry.playerId)}` : ''}
              </span>
              <span className="pill">{entry.score} pts</span>
            </div>
          ))}
        </div>
      </GlassPanel>
      <GlassPanel className="advance-panel" tone="soft">
        <p className="eyebrow">Encore?</p>
        <Button id="advance-button" className="spotlight-button" wide onClick={() => send({ type: 'startGame' })}>
          Play Again
        </Button>
      </GlassPanel>
    </div>
  );
}
