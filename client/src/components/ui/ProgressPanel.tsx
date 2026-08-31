import type { GamePhase, RoomSnapshot } from '../../protocol';
import { playingPlayers } from '../../spectator';

type SubmissionPhase = Extract<GamePhase, 'drawing' | 'guessing' | 'voting'>;

interface ProgressPanelProps {
  title: string;
  snapshot: RoomSnapshot;
  submittedIds: string[];
  phase: SubmissionPhase;
  compact?: boolean;
}

function progressWaitingNames(waitingNames: string[]): string {
  return waitingNames.join(', ');
}

export function ProgressPanel({
  title,
  snapshot,
  submittedIds,
  phase,
  compact = false
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
    </div>
  );
}
