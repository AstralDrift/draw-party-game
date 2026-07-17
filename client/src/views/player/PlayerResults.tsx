import { useGame } from '../../app/GameProvider';
import { useRevealStage } from '../../hooks/useRevealStage';
import { isSelfHost } from '../../host';
import { HostAdvanceControls } from '../../components/ui/HostAdvanceControls';
import { ResultsPanel } from '../../components/ui/ResultsPanel';
import { ScoresPanel } from '../../components/ui/ScoresPanel';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Shell } from '../../components/ui/Shell';

export function PlayerResults(): React.JSX.Element {
  const { snapshot, clientId, send } = useGame();
  const result = snapshot?.roundResult;
  const { stage, complete } = useRevealStage(result, snapshot?.turnToken ?? 0);
  const isHost = isSelfHost(snapshot?.players ?? [], clientId ?? '');

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
        <HostAdvanceControls
          label="Continue"
          disabled={Boolean(result) && !complete}
          onAdvance={() => send({ type: 'startGame' })}
          hint="Or wait — the TV auto-continues when the timer hits zero."
        />
      ) : null}
    </Shell>
  );
}

export function PlayerFinal(): React.JSX.Element {
  const { snapshot, clientId, send, setErrorMessage } = useGame();
  const scores = snapshot?.finalScores ?? [];
  const isHost = isSelfHost(snapshot?.players ?? [], clientId ?? '');

  return (
    <Shell title="Final Scores">
      <ScoresPanel
        scores={scores}
        podium
        role="player"
        onShareFailed={() => setErrorMessage('Could not export the podium card.')}
      />
      {isHost ? (
        <HostAdvanceControls
          label="Play Again"
          onAdvance={() => send({ type: 'startGame' })}
          hint="Same room. Same phones. Fresh prompts."
        />
      ) : null}
    </Shell>
  );
}
