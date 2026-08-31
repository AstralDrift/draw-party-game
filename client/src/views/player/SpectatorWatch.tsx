import { useGame } from '../../app/GameProvider';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ReactionBar, ReactionBursts } from '../../components/ui/ReactionBar';
import { Shell } from '../../components/ui/Shell';
import { PlayerFinal, PlayerResults } from './PlayerResults';
import { PlayerLobby } from './PlayerLobby';

function SpectatorLookUp({
  className,
  reactions
}: {
  className: string;
  reactions: boolean;
}): React.JSX.Element {
  return (
    <Shell title="Watch">
      <GlassPanel className={`play-panel player-turn-panel ${className}`}>
        <div className="turn-header compact">
          <div className="turn-copy">
            <div className="prompt small" aria-label="Spectating. Look up. You play next round.">
              Look up
            </div>
          </div>
        </div>
        {reactions ? <ReactionBar /> : null}
      </GlassPanel>
      {reactions ? <ReactionBursts /> : null}
    </Shell>
  );
}

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
    <SpectatorLookUp
      className="drawing-turn spectator-turn"
      reactions={false}
    />
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
    <SpectatorLookUp
      className="guessing-turn spectator-turn"
      reactions
    />
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
    <SpectatorLookUp
      className="voting-turn spectator-turn"
      reactions
    />
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
