import { useGame } from '../../app/GameProvider';
import { ProgressPanel } from '../../components/ui/ProgressPanel';
import { GlassPanel } from '../../components/ui/GlassPanel';

export function DisplayDrawing(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return <GlassPanel />;
  }

  return (
    <div className="display-grid display-grid-drawing">
      <GlassPanel className="hero-panel">
        <p className="eyebrow">
          Round {snapshot.currentRound} of {snapshot.totalRounds}
        </p>
        <h2>Players are drawing</h2>
        <p className="muted hero-hint">Phones are the controllers. The TV keeps the room moving.</p>
      </GlassPanel>
      <ProgressPanel
        title="Drawings"
        snapshot={snapshot}
        submittedIds={snapshot.drawingSubmittedIds}
        phase="drawing"
      />
    </div>
  );
}
