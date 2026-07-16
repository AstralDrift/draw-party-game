import { useGame } from '../../app/GameProvider';
import { Deadline } from '../../components/ui/Deadline';
import { DrawingCanvas } from '../../components/ui/DrawingPadHost';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ReactionBursts } from '../../components/ui/ReactionBar';

export function DisplayGuessing(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return <GlassPanel />;
  }
  const submitted = new Set(snapshot.guessSubmittedIds);
  const eligible = snapshot.players.filter(
    (player) => player.connected && player.id !== snapshot.currentArtistId
  );
  const done = eligible.filter((player) => submitted.has(player.id)).length;

  return (
    <>
      <div className="display-grid display-grid-guessing">
        <GlassPanel className="reveal-panel">
          <div className="turn-header">
            <div>
              <p className="eyebrow">{snapshot.currentArtistName ?? 'Artist'}</p>
              <h2>What is this?</h2>
            </div>
            <Deadline />
          </div>
          <DrawingCanvas drawing={snapshot.currentDrawing} />
        </GlassPanel>
        <GlassPanel className="progress-panel" tone="soft">
          <div className="panel-title">Guesses</div>
          <div className="big-count">
            {done}/{eligible.length}
          </div>
          {eligible.map((player) => (
            <div key={player.id} className="submission-row">
              <span>{player.name}</span>
              <span className="pill">{submitted.has(player.id) ? 'in' : '…'}</span>
            </div>
          ))}
        </GlassPanel>
      </div>
      <ReactionBursts />
    </>
  );
}

export function DisplayVoting(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return <GlassPanel />;
  }
  const submitted = new Set(snapshot.voteSubmittedIds);
  const eligible = snapshot.players.filter(
    (player) => player.connected && player.id !== snapshot.currentArtistId
  );
  const done = eligible.filter((player) => submitted.has(player.id)).length;

  return (
    <>
      <div className="display-grid display-grid-voting">
        <GlassPanel className="reveal-panel">
          <div className="turn-header">
            <div>
              <p className="eyebrow">{snapshot.currentArtistName ?? 'Artist'}</p>
              <h2>Vote for the real prompt</h2>
            </div>
            <Deadline />
          </div>
          <DrawingCanvas drawing={snapshot.currentDrawing} />
          <div className="vote-grid">
            {snapshot.votingOptions.map((option) => (
              <div key={option.id} className="vote-option">
                {option.text}
              </div>
            ))}
          </div>
        </GlassPanel>
        <GlassPanel className="progress-panel" tone="soft">
          <div className="panel-title">Votes</div>
          <div className="big-count">
            {done}/{eligible.length}
          </div>
        </GlassPanel>
      </div>
      <ReactionBursts />
    </>
  );
}
