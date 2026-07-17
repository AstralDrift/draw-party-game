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
              <h2>What did they draw?</h2>
            </div>
            <Deadline />
          </div>
          <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas" />
          <p className="muted reveal-coach">Phones are inventing fake titles right now.</p>
        </GlassPanel>
        <ProgressPanel
          title="Fake titles"
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
              <h2>Which title is real?</h2>
            </div>
            <Deadline />
          </div>
          <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas" />
          <p className="muted reveal-coach">Don’t trust the funny ones.</p>
        </GlassPanel>
        <GlassPanel className="vote-list panel" tone="soft">
          <div className="panel-title">On the phones</div>
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
