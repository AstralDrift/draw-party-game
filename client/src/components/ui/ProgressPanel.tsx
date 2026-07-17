import type { GamePhase, RoomSnapshot } from '../../protocol';
import { playingPlayers } from '../../spectator';
import { GlassPanel } from './GlassPanel';

type SubmissionPhase = Extract<GamePhase, 'drawing' | 'guessing' | 'voting'>;

interface ProgressPanelProps {
  title: string;
  snapshot: RoomSnapshot;
  submittedIds: string[];
  phase: SubmissionPhase;
}

function submissionStatusLabel(
  state: 'offline' | 'artist' | 'submitted' | 'waiting',
  phase: SubmissionPhase
): string {
  if (state === 'offline') {
    return 'offline';
  }
  if (state === 'artist') {
    return 'artist';
  }
  if (state === 'waiting') {
    return 'waiting';
  }
  switch (phase) {
    case 'drawing':
      return 'drawing in';
    case 'guessing':
      return 'guess in';
    case 'voting':
      return 'voted';
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export function ProgressPanel({
  title,
  snapshot,
  submittedIds,
  phase
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

  return (
    <GlassPanel className="progress-panel" tone="soft">
      <div className="panel-title">{title}</div>
      <div className="progress-hero">
        <div className="big-count">
          {activeSubmittedIds.length}/{eligiblePlayers.length}
        </div>
      </div>
      <p className="muted">
        {waitingNames.length === 0 ? 'Everyone is in.' : `Waiting on ${waitingNames.join(', ')}.`}
      </p>
      <div className="player-list submission-list">
        {players.map((player, index) => {
          const artist = phase !== 'drawing' && player.id === snapshot.currentArtistId;
          const submitted = submittedIds.includes(player.id);
          const state = !player.connected
            ? 'offline'
            : artist
              ? 'artist'
              : submitted
                ? 'submitted'
                : 'waiting';
          return (
            <div
              key={player.id}
              className={`player-row submission-row ${player.connected ? 'online' : 'offline'} is-${state}`}
              style={{ ['--row-index' as string]: index }}
            >
              <span className="player-name">{player.name}</span>
              <span className={`pill status-pill status-${state}`}>
                {submissionStatusLabel(state, phase)}
              </span>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}
