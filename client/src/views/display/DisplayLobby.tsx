import { Play, Volume2, VolumeX } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { PARTY_MIN_PLAYERS } from '../../controller';
import { displayLobbyStartNote } from '../../polish';
import { activePlayers, connectedSpectators } from '../../spectator';
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
  const spectatorCount = connectedSpectators(snapshot.players).length;
  const partyMinimum = Math.max(PARTY_MIN_PLAYERS, snapshot.minPlayers);
  const canStartParty = connectedPlayers.length >= partyMinimum;
  const startNote = displayLobbyStartNote(connectedPlayers.length, partyMinimum);
  const rosterNote =
    spectatorCount > 0 ? `${startNote} · ${spectatorCount} spectating` : startNote;

  return (
    <div className="display-grid display-grid-lobby">
      <GlassPanel className="room-panel">
        <div className="room-intro">
          <div className="room-hero-copy">
            <h2>Everybody draws. Everybody guesses.</h2>
          </div>
          <div className="room-code-wrap" aria-label={`Room Code ${snapshot.roomCode}`}>
            <div className="room-code">{snapshot.roomCode}</div>
          </div>
        </div>
        <div className="qr-stage">
          <QrCode url={joinUrl} />
        </div>
        <p className="join-url manual-join" aria-label={`Can’t scan? ${manualJoinUrl}`}>
          <strong className="manual-join-url">{manualJoinUrl}</strong>
        </p>
      </GlassPanel>

      <div className="lobby-side">
        <GlassPanel className="players-panel" tone="soft" aria-label="Players">
          <div className="players-panel-head">
            <p className={canStartParty ? 'muted players-count start-note ready' : 'muted players-count start-note'}>
              {rosterNote}
            </p>
            <div className="players-panel-actions">
              {canStartParty ? (
                <Button
                  className="start-button tv-start-fallback"
                  icon={Play}
                  variant="ghost"
                  aria-label="Start from TV (fallback)"
                  onClick={() => send({ type: 'startGame' })}
                />
              ) : null}
              <Button
                variant="ghost"
                icon={soundOn ? Volume2 : VolumeX}
                className={`sound-toggle ${soundOn ? 'is-selected' : ''}`}
                aria-label={soundOn ? 'Sound On' : 'Sound Off'}
                aria-pressed={soundOn}
                onClick={toggleSound}
              />
            </div>
          </div>
          <PlayerList players={snapshot.players} />
        </GlassPanel>
      </div>
    </div>
  );
}
