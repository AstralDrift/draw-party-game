import type { PlayerPublic } from '../../protocol';

interface PlayerListProps {
  players: PlayerPublic[];
  showScores?: boolean;
}

export function PlayerList({ players, showScores = false }: PlayerListProps): React.JSX.Element {
  if (players.length === 0) {
    return <div className="empty-state">Waiting for phones to join.</div>;
  }

  return (
    <div className="player-list">
      {players.map((player) => {
        const statusPill = player.spectator
          ? player.connected
            ? 'spectating'
            : 'spectator offline'
          : showScores
            ? `${player.score} pts`
            : player.connected
              ? 'online'
              : 'offline';
        return (
          <div
            key={player.id}
            className={`player-row ${player.connected ? 'online' : 'offline'}${player.spectator ? ' is-spectator' : ''}`}
          >
            <span className="player-name">{player.name}</span>
            <span className={`pill${player.spectator ? ' spectator-pill' : ''}`}>{statusPill}</span>
          </div>
        );
      })}
    </div>
  );
}
