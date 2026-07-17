import { useGame } from '../../app/GameProvider';
import { useRevealStage } from '../../hooks/useRevealStage';
import { Button } from '../../components/ui/Button';
import { ResultsPanel } from '../../components/ui/ResultsPanel';
import { ScoresPanel } from '../../components/ui/ScoresPanel';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Shell } from '../../components/ui/Shell';

export function PlayerResults(): React.JSX.Element {
  const { snapshot, clientId, send } = useGame();
  const result = snapshot?.roundResult;
  const { stage, complete } = useRevealStage(result, snapshot?.turnToken ?? 0);
  const self = snapshot?.players.find((player) => player.id === clientId);
  const isHost = Boolean(self?.isHost);

  return (
    <Shell title="Results">
      {result ? (
        <ResultsPanel
          result={result}
          drawing={snapshot?.currentDrawing}
          stage={stage}
          includeDrawing={false}
          showReactions
        />
      ) : (
        <GlassPanel>
          <p className="muted">Watch the TV for the reveal.</p>
        </GlassPanel>
      )}
      {isHost ? (
        <GlassPanel className="advance-panel" tone="soft">
          <p className="eyebrow">Host controls</p>
          <Button
            className="spotlight-button"
            wide
            disabled={Boolean(result) && !complete}
            onClick={() => send({ type: 'startGame' })}
          >
            Continue
          </Button>
          <p className="muted">Or wait — the TV auto-continues when the timer hits zero.</p>
        </GlassPanel>
      ) : null}
    </Shell>
  );
}

export function PlayerFinal(): React.JSX.Element {
  const { snapshot, clientId, send, setErrorMessage } = useGame();
  const scores = snapshot?.finalScores ?? [];
  const self = snapshot?.players.find((player) => player.id === clientId);
  const isHost = Boolean(self?.isHost);

  return (
    <Shell title="Final Scores">
      <ScoresPanel
        scores={scores}
        podium
        role="player"
        onShareFailed={() => setErrorMessage('Could not export the podium card.')}
      />
      {isHost ? (
        <GlassPanel className="advance-panel encore-panel" tone="soft">
          <p className="eyebrow">Host controls</p>
          <Button className="spotlight-button" wide onClick={() => send({ type: 'startGame' })}>
            Play Again
          </Button>
          <p className="muted">Same room. Same phones. Fresh prompts.</p>
        </GlassPanel>
      ) : null}
    </Shell>
  );
}
