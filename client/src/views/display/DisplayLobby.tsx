import { useGame } from '../../app/GameProvider';
import { displayLobbyStartNote } from '../../polish';
import { activePlayers, playerCountLabel } from '../../spectator';
import { Button } from '../../components/ui/Button';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { PlayerList } from '../../components/ui/PlayerList';
import { QrCode } from '../../components/ui/QrCode';
import { RoomSettingsPanel } from '../../components/ui/RoomSettingsPanel';

export function DisplayLobby(): React.JSX.Element {
  const { snapshot, send, updateSettings, soundOn, toggleSound } = useGame();
  if (!snapshot) {
    return <GlassPanel>Connecting…</GlassPanel>;
  }

  const joinUrl = `${window.location.origin}/join/${snapshot.roomCode}`;
  const connectedPlayers = activePlayers(snapshot.players);
  const canStart = connectedPlayers.length >= snapshot.minPlayers;
  const host = snapshot.players.find((player) => player.isHost);
  const settings = snapshot.settings;

  return (
    <div className="display-grid display-grid-lobby">
      <GlassPanel className="room-panel">
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
        <div className="qr-stage">
          <QrCode url={joinUrl} />
        </div>
        <p className="join-url">{joinUrl}</p>
        <Button
          className="start-button spotlight-button"
          wide
          disabled={!canStart}
          onClick={() => send({ type: 'startGame' })}
        >
          Start Game
        </Button>
        <p className={canStart ? 'start-note ready' : 'start-note'}>
          {host
            ? `${displayLobbyStartNote(connectedPlayers.length, snapshot.minPlayers)} Host phone: ${host.name}.`
            : displayLobbyStartNote(connectedPlayers.length, snapshot.minPlayers)}
        </p>
      </GlassPanel>

      <div className="lobby-side">
        <GlassPanel className="players-panel" tone="soft">
          <div className="panel-title">Players</div>
          <p className="muted players-count">{playerCountLabel(snapshot.players, snapshot.maxPlayers)}</p>
          <PlayerList players={snapshot.players} showScores />
        </GlassPanel>
        <RoomSettingsPanel
          settings={settings}
          onSave={updateSettings}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          subtitle="Optional on TV — the host phone can change these too."
        />
      </div>
    </div>
  );
}
