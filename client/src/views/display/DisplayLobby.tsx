import { Play, Volume2, VolumeX } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { PARTY_MIN_PLAYERS } from '../../controller';
import { displayLobbyStartNote } from '../../polish';
import { PROMPT_PACK_OPTIONS } from '../../protocol';
import { activePlayers, playerCountLabel } from '../../spectator';
import { settingsPaceLabel } from '../../room-settings';
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
  const manualJoinUrl = `${window.location.origin}/join`;
  const connectedPlayers = activePlayers(snapshot.players);
  const partyMinimum = Math.max(PARTY_MIN_PLAYERS, snapshot.minPlayers);
  const canStartParty = connectedPlayers.length >= partyMinimum;
  const settings = snapshot.settings;
  const packLabel =
    PROMPT_PACK_OPTIONS.find((pack) => pack.id === settings.promptPackId)?.label ?? 'Party Safe';

  return (
    <div className="display-grid display-grid-lobby">
      <GlassPanel className="room-panel">
        <div className="room-intro">
          <div className="room-hero-copy">
            <p className="eyebrow">Scan to play</p>
            <h2>Everybody draws. Everybody guesses.</h2>
            <p className="muted room-hero-sub">
              Join on a phone, then look back here. The first phone is the host controller.
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
        <p className="join-url manual-join">
          Can’t scan? Open <strong className="manual-join-url">{manualJoinUrl}</strong> and enter{' '}
          <strong className="manual-join-code">{snapshot.roomCode}</strong>.
        </p>
        <p className={canStartParty ? 'start-note ready' : 'start-note'}>
          {displayLobbyStartNote(connectedPlayers.length, partyMinimum)}
        </p>
      </GlassPanel>

      <div className="lobby-side">
        <GlassPanel className="players-panel" tone="soft">
          <div className="panel-title">Players</div>
          <p className="muted players-count">{playerCountLabel(snapshot.players, snapshot.maxPlayers)}</p>
          <PlayerList players={snapshot.players} />
        </GlassPanel>
        <GlassPanel className="settings-panel settings-summary-panel" tone="soft">
          <div className="panel-title">This party</div>
          <p className="muted panel-subtitle">Pace and pack — change them on the host phone.</p>
          <div className="settings-summary">
            <div>
              <span className="field-label">Pace</span>
              <strong>{settingsPaceLabel(settings)}</strong>
            </div>
            <div>
              <span className="field-label">Pack</span>
              <strong>{packLabel}</strong>
            </div>
          </div>
          <Button
            className="start-button tv-start-fallback"
            icon={Play}
            variant="ghost"
            wide
            aria-label="Start from TV (fallback)"
            disabled={!canStartParty}
            onClick={() => send({ type: 'startGame' })}
          >
            Start Party
          </Button>
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
