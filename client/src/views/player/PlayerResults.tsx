import { useGame } from '../../app/GameProvider';
import { useRevealStage } from '../../hooks/useRevealStage';
import { ResultsPanel } from '../../components/ui/ResultsPanel';
import { ScoresPanel } from '../../components/ui/ScoresPanel';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Shell } from '../../components/ui/Shell';

export function PlayerResults(): React.JSX.Element {
  const { snapshot } = useGame();
  const result = snapshot?.roundResult;
  const { stage } = useRevealStage(result, snapshot?.turnToken ?? 0);

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
    </Shell>
  );
}

export function PlayerFinal(): React.JSX.Element {
  const { snapshot } = useGame();
  const scores = snapshot?.finalScores ?? [];

  return (
    <Shell title="Final Scores">
      <ScoresPanel scores={scores} podium role="player" />
    </Shell>
  );
}
