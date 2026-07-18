import { Play, Volume2, VolumeX } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { displayLobbyStartNote } from '../../polish';
import { activePlayers, playerCountLabel } from '../../spectator';
import { roomHost } from '../../host';
import { Button } from '../../components/ui/Button';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { PlayerList } from '../../components/ui/PlayerList';
import { QrCode } from '../../components/ui/QrCode';

export function DisplayLobby(): React.JSX.Element {
  const { snapshot, send, soundOn, toggleSound } = useGame();
  if (!snapshot) {
    return <GlassPanel>Connecting…</GlassPanel>;
  }

  const joinUrl = `${window.location.origin}/join/${snapshot.roomCode}`;
  const connectedPlayers = activePlayers(snapshot.players);
  const canStart = connectedPlayers.length >= snapshot.minPlayers;
  const host = roomHost(snapshot.players);
  const settings = snapshot.settings;
  const packLabel = settings.promptPackId === 'party-chaos' ? 'Party Chaos' : 'Party Safe';

  return (
    <div className="display-grid display-grid-lobby">
      <GlassPanel className="room-panel">
        <div className="room-intro">
          <div className="room-hero-copy">
            <p className="eyebrow">Scan to play</p>
            <h2>Everybody draws. Everybody guesses.</h2>
            <p className="muted room-hero-sub">
              Phones scan the QR or type the code. The first phone runs the lobby — no TV remote needed.
            </p>
          </div>
          <div className="room-code-wrap">
            <span className="room-code-label">Room Code</span>
            <div className="room-code">{snapshot.roomCode}</div>
          </div>
        </div>
        <div className="qr-stage">
          <QrCode url={joinUrl} />
        </div>
        <p className="join-url">{joinUrl}</p>
        <Button
          className="start-button"
          icon={Play}
          variant="secondary"
          wide
          disabled={!canStart}
          onClick={() => send({ type: 'startGame' })}
        >
          Start Game
        </Button>
        <p className={canStart ? 'start-note ready' : 'start-note'}>
          {host
            ? `${displayLobbyStartNote(connectedPlayers.length, snapshot.minPlayers)} Host phone: ${host.name}. Start from the host phone — or here if you have a remote.`
            : `${displayLobbyStartNote(connectedPlayers.length, snapshot.minPlayers)} Start from the host phone — or here if you have a remote.`}
        </p>
      </GlassPanel>

      <div className="lobby-side">
        <GlassPanel className="players-panel" tone="soft">
          <div className="panel-title">Players</div>
          <p className="muted players-count">{playerCountLabel(snapshot.players, snapshot.maxPlayers)}</p>
          <PlayerList players={snapshot.players} showScores />
        </GlassPanel>
        <GlassPanel className="settings-panel settings-summary-panel" tone="soft">
          <div className="panel-title">Room Settings</div>
          <p className="muted panel-subtitle">Live values — change them on the host phone.</p>
          <div className="settings-summary">
            <div>
              <span className="field-label">Rounds</span>
              <strong>{settings.rounds}</strong>
            </div>
            <div>
              <span className="field-label">Drawing</span>
              <strong>{settings.drawSeconds}s</strong>
            </div>
            <div>
              <span className="field-label">Guessing</span>
              <strong>{settings.guessSeconds}s</strong>
            </div>
            <div>
              <span className="field-label">Voting</span>
              <strong>{settings.voteSeconds}s</strong>
            </div>
            <div>
              <span className="field-label">Results</span>
              <strong>{settings.resultsSeconds}s</strong>
            </div>
            <div>
              <span className="field-label">Pack</span>
              <strong>{packLabel}</strong>
            </div>
          </div>
        </GlassPanel>
        <Button
          variant="secondary"
          icon={soundOn ? Volume2 : VolumeX}
          wide
          className={`sound-toggle ${soundOn ? 'is-selected' : ''}`}
          aria-pressed={soundOn}
          onClick={toggleSound}
        >
          {soundOn ? 'Sound On' : 'Sound Off'}
        </Button>
      </div>
    </div>
  );
}
