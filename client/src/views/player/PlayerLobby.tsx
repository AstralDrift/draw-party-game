import { useGame } from '../../app/GameProvider';
import { activePlayers } from '../../spectator';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { PlayerList } from '../../components/ui/PlayerList';
import { Shell } from '../../components/ui/Shell';
import { SpectatorBanner } from '../../components/ui/SpectatorBanner';

export function PlayerLobby(): React.JSX.Element {
  const { snapshot, clientId } = useGame();
  if (!snapshot) {
    return (
      <Shell title="Lobby">
        <GlassPanel />
      </Shell>
    );
  }

  const connectedPlayers = activePlayers(snapshot.players);
  const neededPlayers = Math.max(0, snapshot.minPlayers - connectedPlayers.length);
  const self = snapshot.players.find((player) => player.id === clientId);
  const spectating = Boolean(self?.spectator);
  const ready = neededPlayers === 0;

  return (
    <Shell title="Lobby">
      <div className="player-stack lobby-player-stack">
        <GlassPanel className={`player-lobby-card ${ready && !spectating ? 'is-ready' : ''}`}>
          {spectating ? <SpectatorBanner /> : null}
          <p className="eyebrow">{self ? `${self.name}, you're in` : "You're in"}</p>
          <h2>
            {spectating ? 'Watching the lobby' : ready ? 'Party is ready' : 'Waiting for players'}
          </h2>
          <div className="player-room-chip">
            <span>Room</span>
            <strong className="mini-room-code">{snapshot.roomCode}</strong>
          </div>
          <div className="player-ready-meter">
            <span className="ready-count">
              {connectedPlayers.length}/{snapshot.maxPlayers}
            </span>
            <span>
              {spectating
                ? 'You join as a player on the next drawing round.'
                : ready
                  ? 'The TV can start the game.'
                  : `Need ${neededPlayers} more ${neededPlayers === 1 ? 'player' : 'players'}.`}
            </span>
          </div>
          <p className="muted">
            {spectating
              ? 'You’re watching for now. You’ll draw next round.'
              : 'Watch the TV. Your phone is the controller once the round starts.'}
          </p>
        </GlassPanel>
        <GlassPanel className="players-panel" tone="soft">
          <div className="panel-title">Players</div>
          <PlayerList players={snapshot.players} />
        </GlassPanel>
      </div>
    </Shell>
  );
}
