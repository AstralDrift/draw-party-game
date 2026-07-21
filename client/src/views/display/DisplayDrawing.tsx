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

  return (
    <div className="display-grid display-grid-drawing">
      <GlassPanel className="hero-panel">
        <div className="turn-header">
          <div>
            <p className="eyebrow">
              {practice ? 'Warm-up · no scores' : `Round ${snapshot.currentRound} of ${snapshot.totalRounds}`}
            </p>
            <h2>{practice ? 'Practice drawing' : 'Phones are drawing'}</h2>
          </div>
          <Deadline />
        </div>
        <p className="muted hero-hint">
          {practice
            ? 'Try the canvas, submit it, then see the drawing on the TV.'
            : 'Keep eyes on the TV. Secrets stay on the phones.'}
        </p>
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
