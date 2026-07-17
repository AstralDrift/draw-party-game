import { useGame } from '../../app/GameProvider';
import { Deadline } from '../../components/ui/Deadline';
import { DrawingCanvas } from '../../components/ui/DrawingPadHost';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ProgressPanel } from '../../components/ui/ProgressPanel';
import { ReactionBar, ReactionBursts } from '../../components/ui/ReactionBar';
import { Shell } from '../../components/ui/Shell';
import { SpectatorBanner } from '../../components/ui/SpectatorBanner';
import { PlayerFinal, PlayerResults } from './PlayerResults';
import { PlayerLobby } from './PlayerLobby';

export function SpectatorDrawing(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return (
      <Shell title="Watch">
        <GlassPanel />
      </Shell>
    );
  }

  return (
    <Shell title="Watch">
      <GlassPanel className="play-panel player-turn-panel drawing-turn spectator-turn">
        <SpectatorBanner />
        <div className="turn-header">
          <div className="turn-copy">
            <p className="eyebrow">
              Round {snapshot.currentRound} of {snapshot.totalRounds}
            </p>
            <div className="prompt small">Players are drawing</div>
          </div>
          <Deadline />
        </div>
        <p className="action-hint">Sit tight and watch the TV.</p>
        <ProgressPanel
          title="Drawings"
          snapshot={snapshot}
          submittedIds={snapshot.drawingSubmittedIds}
          phase="drawing"
        />
      </GlassPanel>
    </Shell>
  );
}

export function SpectatorGuessing(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return (
      <Shell title="Watch">
        <GlassPanel />
      </Shell>
    );
  }

  return (
    <Shell title="Watch">
      <GlassPanel className="play-panel player-turn-panel guessing-turn spectator-turn">
        <SpectatorBanner />
        <div className="turn-header compact">
          <div className="turn-copy">
            <p className="eyebrow">
              {snapshot.currentArtistName ? `By ${snapshot.currentArtistName}` : 'Reveal'}
            </p>
            <div className="prompt small">Players are guessing</div>
          </div>
          <Deadline />
        </div>
        <p className="action-hint">Watch the guesses roll in.</p>
        <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas phone-canvas" />
        <ReactionBar />
      </GlassPanel>
      <ReactionBursts />
    </Shell>
  );
}

export function SpectatorVoting(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return (
      <Shell title="Watch">
        <GlassPanel />
      </Shell>
    );
  }

  return (
    <Shell title="Watch">
      <GlassPanel className="play-panel player-turn-panel voting-turn spectator-turn">
        <SpectatorBanner />
        <div className="turn-header compact">
          <div className="turn-copy">
            <p className="eyebrow">
              {snapshot.currentArtistName ? `By ${snapshot.currentArtistName}` : 'Reveal'}
            </p>
            <div className="prompt small">Players are voting</div>
          </div>
          <Deadline />
        </div>
        <p className="action-hint">Watch the vote on the TV.</p>
        <DrawingCanvas drawing={snapshot.currentDrawing} className="reveal-canvas phone-canvas" />
        <div className="vote-list compact player-vote-list">
          {snapshot.votingOptions.map((option, index) => (
            <div
              key={option.id}
              className="vote-option disabled"
              style={{ ['--row-index' as string]: index }}
            >
              <span className="vote-answer">{option.text}</span>
            </div>
          ))}
        </div>
        <ReactionBar />
      </GlassPanel>
      <ReactionBursts />
    </Shell>
  );
}

/** Route spectators to watch UIs; lobby/results/final reuse player screens. */
export function SpectatorPhase(): React.JSX.Element {
  const { snapshot } = useGame();
  if (!snapshot) {
    return <PlayerLobby />;
  }

  switch (snapshot.phase) {
    case 'lobby':
      return <PlayerLobby />;
    case 'drawing':
      return <SpectatorDrawing />;
    case 'guessing':
      return <SpectatorGuessing />;
    case 'voting':
      return <SpectatorVoting />;
    case 'results':
      return <PlayerResults />;
    case 'finalScores':
      return <PlayerFinal />;
    default: {
      const _exhaustive: never = snapshot.phase;
      return _exhaustive;
    }
  }
}
