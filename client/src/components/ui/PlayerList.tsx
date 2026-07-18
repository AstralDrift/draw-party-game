import type { PlayerPublic } from '../../protocol';
import { UsersRound } from 'lucide';
import { LucideIcon } from './LucideIcon';

interface PlayerListProps {
  players: PlayerPublic[];
  showScores?: boolean;
}

export function PlayerList({ players, showScores = false }: PlayerListProps): React.JSX.Element {
  if (players.length === 0) {
    return (
      <div className="player-list player-list--empty">
        <div className="empty-state">
          <span className="empty-icon-wrap"><LucideIcon icon={UsersRound} className="empty-icon" /></span>
          <span>Waiting for phones to join.</span>
        </div>
      </div>
    );
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
              ? player.isHost
                ? 'host'
                : 'online'
              : 'offline';
        return (
          <div
            key={player.id}
            className={`player-row ${player.connected ? 'online' : 'offline'}${player.spectator ? ' is-spectator' : ''}${player.isHost ? ' is-host' : ''}`}
          >
            <span className="player-name">
              {player.name}
              {player.isHost ? <span className="host-badge">Host</span> : null}
            </span>
            <span className={`pill${player.spectator ? ' spectator-pill' : ''}`}>{statusPill}</span>
          </div>
        );
      })}
    </div>
  );
}
