import type { PlayerPublic } from '../../protocol';
import { UsersRound } from 'lucide';
import { LucideIcon } from './LucideIcon';
import { playerAccentSlot, playerInitial } from '../../player-identity';

export { playerAccentSlot } from '../../player-identity';

interface PlayerListProps {
  players: PlayerPublic[];
  showScores?: boolean;
  /** Dashed placeholder seats for players still needed to start (TV lobby). */
  openSeats?: number;
}

function OpenSeats({ count }: { count: number }): React.JSX.Element | null {
  if (count <= 0) {
    return null;
  }
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={`open-${index}`} className="open-seat" aria-hidden="true">
          <span className="open-seat-doodle" />
        </div>
      ))}
    </>
  );
}

export function PlayerList({ players, showScores = false, openSeats = 0 }: PlayerListProps): React.JSX.Element {
  if (players.length === 0) {
    return (
      <div className="player-list player-list--empty">
        <div className={`empty-state${openSeats > 0 ? ' has-open-seats' : ''}`} aria-label="Waiting for phones to join.">
          {openSeats > 0 ? (
            <OpenSeats count={openSeats} />
          ) : (
            <span className="empty-icon-wrap" aria-hidden="true"><LucideIcon icon={UsersRound} className="empty-icon" /></span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="player-list">
      {players.map((player) => {
        const status = !player.connected ? 'Offline' : null;
        const statusClass = !player.connected ? 'is-offline' : '';
        return (
          <div
            key={player.id}
            data-player-slot={playerAccentSlot(player.id)}
            className={`player-row ${player.connected ? 'online' : 'offline'}${player.spectator ? ' is-spectator' : ''}${player.isHost ? ' is-host' : ''}`}
            aria-label={
              player.spectator
                ? `${player.name}${player.isHost ? ', host' : ''}, spectating`
                : undefined
            }
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
            {showScores || status ? (
              <span className="player-meta">
                {showScores ? <span className="player-score">{player.score} pts</span> : null}
                {status ? <span className={`pill player-status ${statusClass}`}>{status}</span> : null}
              </span>
            ) : null}
          </div>
        );
      })}
      <OpenSeats count={openSeats} />
    </div>
  );
}
