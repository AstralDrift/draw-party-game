import { GameProvider, useGame } from './GameProvider';
import { Shell } from '../components/ui/Shell';
import { GlassPanel } from '../components/ui/GlassPanel';
import { DisplayLobby } from '../views/display/DisplayLobby';
import { DisplayDrawing } from '../views/display/DisplayDrawing';
import { DisplayGuessing, DisplayVoting } from '../views/display/DisplayReveal';
import { DisplayFinal, DisplayResults } from '../views/display/DisplayResults';
import { JoinScreen } from '../views/player/JoinScreen';
import { PlayerLobby } from '../views/player/PlayerLobby';
import { PlayerDrawing } from '../views/player/PlayerDrawing';
import { PlayerGuessing, PlayerVoting } from '../views/player/PlayerPlay';
import { PlayerFinal, PlayerResults } from '../views/player/PlayerResults';
import { SpectatorPhase } from '../views/player/SpectatorWatch';
import { isSpectator } from '../spectator';

function DisplayApp(): React.JSX.Element {
  const { snapshot, status } = useGame();
  if (!snapshot) {
    return (
      <Shell title="TV Display">
        <GlassPanel>
          <p className="muted">{status}</p>
        </GlassPanel>
      </Shell>
    );
  }

  let body: React.JSX.Element;
  switch (snapshot.phase) {
    case 'lobby':
      body = <DisplayLobby />;
      break;
    case 'drawing':
      body = <DisplayDrawing />;
      break;
    case 'guessing':
      body = <DisplayGuessing />;
      break;
    case 'voting':
      body = <DisplayVoting />;
      break;
    case 'results':
      body = <DisplayResults />;
      break;
    case 'finalScores':
      body = <DisplayFinal />;
      break;
    default: {
      const _exhaustive: never = snapshot.phase;
      void _exhaustive;
      body = <GlassPanel />;
      break;
    }
  }

  return <Shell title="Draw Party">{body}</Shell>;
}

function PlayerApp(): React.JSX.Element {
  const { snapshot, clientId } = useGame();
  if (!snapshot) {
    return <JoinScreen />;
  }

  if (isSpectator(snapshot.players, clientId)) {
    return <SpectatorPhase />;
  }

  switch (snapshot.phase) {
    case 'lobby':
      return <PlayerLobby />;
    case 'drawing':
      return <PlayerDrawing />;
    case 'guessing':
      return <PlayerGuessing />;
    case 'voting':
      return <PlayerVoting />;
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

export function App(): React.JSX.Element {
  return (
    <GameProvider>
      <AppRouter />
    </GameProvider>
  );
}

function AppRouter(): React.JSX.Element {
  const { role } = useGame();
  return role === 'display' ? <DisplayApp /> : <PlayerApp />;
}
