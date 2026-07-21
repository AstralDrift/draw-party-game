import type { PlayerPublic } from '../../protocol';
import { UsersRound } from 'lucide';
import { LucideIcon } from './LucideIcon';

interface PlayerListProps {
  players: PlayerPublic[];
  showScores?: boolean;
}

const PLAYER_ACCENT_COUNT = 8;

/** Stable across roster reorder and reconnect; deliberately independent of array position. */
export function playerAccentSlot(playerId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < playerId.length; index += 1) {
    hash ^= playerId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % PLAYER_ACCENT_COUNT;
}

function playerInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?';
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
        const status = player.connected ? (player.spectator ? 'Watching' : 'Ready') : 'Offline';
        const statusClass = player.connected
          ? player.spectator
            ? 'is-watching'
            : 'is-ready'
          : 'is-offline';
        return (
          <div
            key={player.id}
            data-player-slot={playerAccentSlot(player.id)}
            className={`player-row ${player.connected ? 'online' : 'offline'}${player.spectator ? ' is-spectator' : ''}${player.isHost ? ' is-host' : ''}`}
          >
            <span className="player-identity">
              <span className="player-doodle" aria-hidden="true">
                {playerInitial(player.name)}
              </span>
              <span className="player-name">
                <span className="player-name-text">{player.name}</span>
                {player.isHost ? (
                  <>
                    {' '}
                    <span className="host-badge">Host</span>
                  </>
                ) : null}
              </span>
            </span>
            <span className="player-meta">
              {showScores ? <span className="player-score">{player.score} pts</span> : null}
              <span className={`pill player-status ${statusClass}`}>{status}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
