import { Check, Pencil } from 'lucide';
import type { GamePhase, RoomSnapshot } from '../../protocol';
import { playingPlayers } from '../../spectator';
import { playerAccentSlot } from '../../player-identity';
import { LucideIcon } from './LucideIcon';
import { PlayerAvatar } from './PlayerAvatar';

type SubmissionPhase = Extract<GamePhase, 'drawing' | 'guessing' | 'voting'>;

interface ProgressPanelProps {
  title: string;
  snapshot: RoomSnapshot;
  submittedIds: string[];
  phase: SubmissionPhase;
  compact?: boolean;
  /** Large avatar seats for every eligible player (TV drawing stage). */
  roster?: boolean;
}

function progressWaitingNames(waitingNames: string[]): string {
  return waitingNames.join(', ');
}

export function ProgressPanel({
  title,
  snapshot,
  submittedIds,
  phase,
  compact = false,
  roster = false
}: ProgressPanelProps): React.JSX.Element {
  const players = playingPlayers(snapshot.players);
  const connectedPlayers = players.filter((player) => player.connected);
  const eligiblePlayers = connectedPlayers.filter(
    (player) => phase === 'drawing' || player.id !== snapshot.currentArtistId
  );
  const activeSubmittedIds = submittedIds.filter((playerId) =>
    eligiblePlayers.some((player) => player.id === playerId)
  );
  const waitingNames = eligiblePlayers
    .filter((player) => !submittedIds.includes(player.id))
    .map((player) => player.name);

  const waitingLine = progressWaitingNames(waitingNames);

  return (
    <div className={`progress-panel${compact ? ' progress-panel-compact' : ''}`} aria-label={title}>
      <div className="progress-hero">
        <div className="big-count">
          {activeSubmittedIds.length}/{eligiblePlayers.length}
        </div>
      </div>
      {waitingLine ? (
        <p className="muted" aria-label={`Waiting on ${waitingLine}`}>
          {waitingLine}
        </p>
      ) : null}
      {roster ? (
        <ul className="progress-roster" aria-hidden="true">
          {eligiblePlayers.map((player) => {
            const done = submittedIds.includes(player.id);
            return (
              <li
                key={player.id}
                className={`progress-seat${done ? ' is-done' : ''}`}
                data-player-slot={playerAccentSlot(player.id)}
              >
                <PlayerAvatar playerId={player.id} name={player.name} size="lg" />
                <span className="progress-seat-name">{player.name}</span>
                <span className="progress-seat-state">
                  <LucideIcon icon={done ? Check : Pencil} className="progress-seat-icon" />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="progress-avatars" aria-hidden="true">
          {eligiblePlayers.map((player) => (
            <span
              key={player.id}
              className={`progress-avatar${submittedIds.includes(player.id) ? ' is-done' : ''}`}
            >
              <PlayerAvatar playerId={player.id} name={player.name} size="sm" />
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
