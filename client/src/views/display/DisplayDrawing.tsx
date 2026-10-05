import { useGame } from '../../app/GameProvider';
import { connectedSpectators } from '../../spectator';
import { Deadline } from '../../components/ui/Deadline';
import { ProgressPanel } from '../../components/ui/ProgressPanel';
import { GlassPanel } from '../../components/ui/GlassPanel';

export function DisplayDrawing(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return <GlassPanel />;
  }

  const watchers = connectedSpectators(snapshot.players);
  const practice = snapshot.gameMode === 'practice';
  const watcherNames = watchers.map((player) => player.name).join(', ');

  return (
    <div className="display-grid display-grid-drawing">
      <GlassPanel className="hero-panel">
        <div className="turn-header">
          <p className="eyebrow">
            {practice ? 'Warm-up · no scores' : `Round ${snapshot.currentRound} of ${snapshot.totalRounds}`}
          </p>
          <Deadline />
        </div>
        <ProgressPanel
          title="Drawings"
          snapshot={snapshot}
          submittedIds={snapshot.drawingSubmittedIds}
          phase="drawing"
          compact
        />
        {watcherNames ? (
          <p className="muted spectator-watchers" aria-label={`${watcherNames} spectating`}>
            {watcherNames}
          </p>
        ) : null}
      </GlassPanel>
    </div>
  );
}
