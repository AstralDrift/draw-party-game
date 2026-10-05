import { useGame } from '../../app/GameProvider';
import { optionLabel } from '../../option-label';
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
        <GlassPanel className="reveal-panel" aria-label={snapshot.currentArtistName ? `Drawing by ${snapshot.currentArtistName}` : 'Drawing'}>
          <div className="turn-header">
            <ProgressPanel
              title="Fake titles"
              snapshot={snapshot}
              submittedIds={snapshot.guessSubmittedIds}
              phase="guessing"
              compact
            />
            <Deadline />
          </div>
          <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas" />
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

  return (
    <>
      <div className="display-grid display-grid-voting">
        <GlassPanel className="reveal-panel vote-list" aria-label="Which title is real?">
          <div className="turn-header">
            <ProgressPanel
              title="Votes"
              snapshot={snapshot}
              submittedIds={snapshot.voteSubmittedIds}
              phase="voting"
              compact
            />
            <Deadline />
          </div>
          {snapshot.votingOptions.map((option, index) => (
            <div
              key={option.id}
              className="vote-option"
              aria-label={`Option ${optionLabel(index)}: ${option.text}`}
            >
              <span className="vote-option-content">
                <span className="option-label" aria-hidden="true">
                  {optionLabel(index)}
                </span>
                <span className="vote-answer">{option.text}</span>
              </span>
            </div>
          ))}
        </GlassPanel>
      </div>
      <ReactionBursts />
    </>
  );
}
