import { useGame } from '../../app/GameProvider';
import { useRevealStage } from '../../hooks/useRevealStage';
import { Button } from '../../components/ui/Button';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ReactionBursts } from '../../components/ui/ReactionBar';
import { ResultsPanel } from '../../components/ui/ResultsPanel';
import { ScoresPanel } from '../../components/ui/ScoresPanel';

export function DisplayResults(): React.JSX.Element {
  const { snapshot, send } = useGame();
  const result = snapshot?.roundResult;
  const { stage, complete } = useRevealStage(result, snapshot?.turnToken ?? 0);

  if (!snapshot) {
    return <GlassPanel />;
  }

  return (
    <>
      <div className="display-grid display-grid-results">
        {result ? (
          <ResultsPanel
            result={result}
            drawing={snapshot.currentDrawing}
            stage={stage}
            includeDrawing
          />
        ) : (
          <GlassPanel className="results-panel">Waiting for results...</GlassPanel>
        )}
        <GlassPanel className="advance-panel" tone="soft">
          <p className="eyebrow">Keep it moving</p>
          <Button
            id="advance-button"
            className="spotlight-button"
            wide
            disabled={Boolean(result) && !complete}
            onClick={() => send({ type: 'startGame' })}
          >
            Continue
          </Button>
          {snapshot.deadlineMs ? (
            <p className="muted">Auto-continues when the timer hits zero.</p>
          ) : null}
        </GlassPanel>
      </div>
      <ReactionBursts />
    </>
  );
}

export function DisplayFinal(): React.JSX.Element {
  const { snapshot, send, setErrorMessage } = useGame();
  if (!snapshot) {
    return <GlassPanel />;
  }

  return (
    <>
      <div className="display-grid display-grid-finalScores">
        <ScoresPanel
          scores={snapshot.finalScores}
          podium
          role="display"
          onShareFailed={() => setErrorMessage('Could not export the podium card.')}
        />
        <GlassPanel className="advance-panel encore-panel" tone="soft">
          <p className="eyebrow">One more round?</p>
          <h2 className="encore-title">Don’t stop now</h2>
          <Button
            id="advance-button"
            className="spotlight-button"
            wide
            onClick={() => send({ type: 'startGame' })}
          >
            Play Again
          </Button>
          <p className="muted">Same room. Same phones. Fresh prompts.</p>
        </GlassPanel>
      </div>
      <ReactionBursts />
    </>
  );
}
