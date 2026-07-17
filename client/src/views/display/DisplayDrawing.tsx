import { useGame } from '../../app/GameProvider';
import { connectedSpectators } from '../../spectator';
import { ProgressPanel } from '../../components/ui/ProgressPanel';
import { GlassPanel } from '../../components/ui/GlassPanel';

export function DisplayDrawing(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return <GlassPanel />;
  }

  const watchers = connectedSpectators(snapshot.players);

  return (
    <div className="display-grid display-grid-drawing">
      <GlassPanel className="hero-panel">
        <p className="eyebrow">
          Round {snapshot.currentRound} of {snapshot.totalRounds}
        </p>
        <h2>Phones are drawing</h2>
        <p className="muted hero-hint">Keep eyes on the TV. Secrets stay on the phones.</p>
        {watchers.length > 0 ? (
          <div className="spectator-watchers">
            <p className="muted">Watching until next round</p>
            <div className="spectator-watcher-list">
              {watchers.map((player) => (
                <div key={player.id} className="player-row is-spectator">
                  <span className="player-name">{player.name}</span>
                  <span className="pill spectator-pill">Spectating</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
