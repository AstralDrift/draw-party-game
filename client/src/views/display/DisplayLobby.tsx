import { Play } from 'lucide';
import { AudioControl } from '../../components/ui/AudioControl';
import { useGame } from '../../app/GameProvider';
import { PARTY_MIN_PLAYERS } from '../../controller';
import { displayLobbyStartNote } from '../../polish';
import { activePlayers, connectedSpectators } from '../../spectator';
import { Button } from '../../components/ui/Button';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { PlayerList } from '../../components/ui/PlayerList';
import { QrCode } from '../../components/ui/QrCode';

export function DisplayLobby(): React.JSX.Element {
  const { snapshot, send } = useGame();
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
            <p className="party-how-to">Draw a secret. Invent a fake. Find the truth.</p>
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
              <AudioControl />
            </div>
          </div>
          <PlayerList players={snapshot.players} />
        </GlassPanel>
      </div>
    </div>
  );
}
