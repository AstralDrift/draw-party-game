import { useGame } from '../../app/GameProvider';
import { Deadline } from '../../components/ui/Deadline';
import { DrawingCanvas } from '../../components/ui/DrawingPadHost';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ProgressPanel } from '../../components/ui/ProgressPanel';
import { ReactionBursts } from '../../components/ui/ReactionBar';

export function DisplayGuessing(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return <GlassPanel />;
  }

  return (
    <>
      <div className="display-grid display-grid-guessing">
        <GlassPanel className="reveal-panel">
          <div className="turn-header">
            <div>
              <p className="eyebrow">
                {snapshot.currentArtistName ? `By ${snapshot.currentArtistName}` : 'Drawing'}
              </p>
              <h2>What is this?</h2>
            </div>
            <Deadline />
          </div>
          <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas" />
        </GlassPanel>
        <ProgressPanel
          title="Guesses"
          snapshot={snapshot}
          submittedIds={snapshot.guessSubmittedIds}
          phase="guessing"
        />
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

  return (
    <>
      <div className="display-grid display-grid-voting">
        <GlassPanel className="reveal-panel">
          <div className="turn-header">
            <div>
              <p className="eyebrow">
                {snapshot.currentArtistName ? `By ${snapshot.currentArtistName}` : 'Drawing'}
              </p>
              <h2>Vote for the real prompt</h2>
            </div>
            <Deadline />
          </div>
          <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas" />
        </GlassPanel>
        <GlassPanel className="vote-list panel" tone="soft">
          <div className="panel-title">Options</div>
          {snapshot.votingOptions.map((option, index) => (
            <div key={option.id} className="vote-option" style={{ ['--row-index' as string]: index }}>
              <span className="vote-answer">{option.text}</span>
            </div>
          ))}
        </GlassPanel>
        <ProgressPanel
          title="Votes"
          snapshot={snapshot}
          submittedIds={snapshot.voteSubmittedIds}
          phase="voting"
        />
      </div>
      <ReactionBursts />
    </>
  );
}
