import { useGame } from '../../app/GameProvider';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { PlayerList } from '../../components/ui/PlayerList';
import { Shell } from '../../components/ui/Shell';

export function PlayerLobby(): React.JSX.Element {
  const { snapshot, clientId } = useGame();
  if (!snapshot) {
    return (
      <Shell title="Lobby">
        <GlassPanel />
      </Shell>
    );
  }

  const connectedPlayers = snapshot.players.filter((player) => player.connected);
  const neededPlayers = Math.max(0, snapshot.minPlayers - connectedPlayers.length);
  const self = snapshot.players.find((player) => player.id === clientId);
  const ready = neededPlayers === 0;

  return (
    <Shell title="Lobby">
      <div className="player-stack lobby-player-stack">
        <GlassPanel className={`player-lobby-card ${ready ? 'is-ready' : ''}`}>
          <p className="eyebrow">{self ? `${self.name}, you're in` : "You're in"}</p>
          <h2>{ready ? 'Party is ready' : 'Waiting for players'}</h2>
          <div className="player-room-chip">
            <span>Room</span>
            <strong className="mini-room-code">{snapshot.roomCode}</strong>
          </div>
          <div className="player-ready-meter">
            <span className="ready-count">
              {connectedPlayers.length}/{snapshot.maxPlayers}
            </span>
            <span>
              {ready
                ? 'The TV can start the game.'
                : `Need ${neededPlayers} more ${neededPlayers === 1 ? 'player' : 'players'}.`}
            </span>
          </div>
          <p className="muted">Watch the TV. Your device becomes the controller when each round starts.</p>
        </GlassPanel>
        <GlassPanel className="players-panel" tone="soft">
          <div className="panel-title">Players</div>
          <PlayerList players={snapshot.players} />
        </GlassPanel>
      </div>
    </Shell>
  );
}
