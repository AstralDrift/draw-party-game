import { useGame } from '../../app/GameProvider';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { PlayerList } from '../../components/ui/PlayerList';

export function DisplayDrawing(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return <GlassPanel />;
  }

  const submitted = new Set(snapshot.drawingSubmittedIds);
  const eligible = snapshot.players.filter((player) => player.connected);
  const done = eligible.filter((player) => submitted.has(player.id)).length;

  return (
    <div className="display-grid display-grid-drawing">
      <GlassPanel className="hero-panel">
        <p className="eyebrow">
          Round {snapshot.currentRound} of {snapshot.totalRounds}
        </p>
        <h2>Players are drawing</h2>
        <p className="muted">Phones are the controllers. The TV keeps the room moving.</p>
      </GlassPanel>
      <GlassPanel className="progress-panel" tone="soft">
        <div className="panel-title">Drawings</div>
        <div className="big-count">
          {done}/{eligible.length}
        </div>
        <div className="player-list">
          {eligible.map((player) => (
            <div key={player.id} className="submission-row">
              <span>{player.name}</span>
              <span className="pill">{submitted.has(player.id) ? 'done' : 'drawing'}</span>
            </div>
          ))}
        </div>
        <PlayerList players={snapshot.players} />
      </GlassPanel>
    </div>
  );
}
