import { useState } from 'react';
import { BellRing, BellOff, Pencil, Play } from 'lucide';
import { useGame } from '../../app/GameProvider';
import { PARTY_MIN_PLAYERS, supportsPracticeMode } from '../../controller';
import { playerLobbyReadyNote } from '../../polish';
import { activePlayers } from '../../spectator';
import { isSelfHost } from '../../host';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { RoomSettingsPanel } from '../../components/ui/RoomSettingsPanel';
import { Shell } from '../../components/ui/Shell';
import { SpectatorBanner } from '../../components/ui/SpectatorBanner';

export function PlayerLobby(): React.JSX.Element {
  const { snapshot, clientId, soundOn, setName, send, updateSettings, toggleSound } = useGame();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  if (!snapshot) {
    return (
      <Shell title="Lobby">
        <GlassPanel />
      </Shell>
    );
  }

  const connectedPlayers = activePlayers(snapshot.players);
  const partyMinimum = Math.max(PARTY_MIN_PLAYERS, snapshot.minPlayers);
  const neededPlayers = Math.max(0, partyMinimum - connectedPlayers.length);
  const practiceSupported = supportsPracticeMode(snapshot);
  const self = snapshot.players.find((player) => player.id === clientId);
  const spectating = Boolean(self?.spectator);
  const isHost = isSelfHost(snapshot.players, clientId ?? '');
  const ready = neededPlayers === 0;
  const canStartParty = connectedPlayers.length >= partyMinimum;
  const canPractice = practiceSupported && connectedPlayers.length === 1;
  const displayName = self?.name ?? 'Player';
  const readyNote =
    isHost && !spectating
      ? playerLobbyReadyNote(connectedPlayers.length, partyMinimum)
      : '';

  const startRename = () => {
    setNameDraft(displayName);
    setEditingName(true);
  };

  const cancelRename = () => {
    setEditingName(false);
    setNameDraft('');
  };

  const saveRename = () => {
    const next = nameDraft.trim() || 'Player';
    setName(next);
    setEditingName(false);
    setNameDraft('');
  };

  return (
    <Shell title="Lobby">
      <div className="player-stack lobby-player-stack">
        <GlassPanel className={`player-lobby-card ${ready && !spectating ? 'is-ready' : ''}`}>
          {spectating ? <SpectatorBanner /> : null}
          {!editingName ? (
            <div className="lobby-name-row">
              <Button variant="ghost" className="tool-button lobby-rename-button" aria-label="Edit name" onClick={startRename}>
                {displayName}
              </Button>
              <Button
                variant="ghost"
                icon={soundOn ? BellRing : BellOff}
                className={`sound-toggle ${soundOn ? 'is-selected' : ''}`}
                aria-label={soundOn ? 'Turn alerts on' : 'Turn alerts off'}
                aria-pressed={soundOn}
                onClick={toggleSound}
              />
            </div>
          ) : (
            <form
              className="lobby-rename-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveRename();
              }}
            >
              <Field label="Your name">
                <TextInput
                  value={nameDraft}
                  maxLength={24}
                  autoComplete="nickname"
                  autoFocus
                  onChange={(event) => setNameDraft(event.target.value)}
                />
              </Field>
              <div className="lobby-rename-actions">
                <Button type="submit" wide>
                  Save name
                </Button>
                <Button type="button" variant="secondary" wide onClick={cancelRename}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {isHost ? (
            <div className="player-room-chip">
              <span>Room</span>
              <strong className="mini-room-code">{snapshot.roomCode}</strong>
            </div>
          ) : null}
          {readyNote ? <p className="player-ready-meter">{readyNote}</p> : null}
          {isHost ? (
            <>
              <Button
                className="spotlight-button"
                wide
                icon={Play}
                disabled={!canStartParty}
                onClick={() => send({ type: 'startGame' })}
              >
                Start Party
              </Button>
              {canPractice ? (
                <Button
                  variant="secondary"
                  wide
                  icon={Pencil}
                  onClick={() => send({ type: 'startPractice' })}
                >
                  Practice Drawing
                </Button>
              ) : null}
            </>
          ) : spectating ? null : (
            <p className="muted">Watch the TV.</p>
          )}
        </GlassPanel>
        {isHost ? (
          <RoomSettingsPanel settings={snapshot.settings} onSave={updateSettings} />
        ) : null}
      </div>
    </Shell>
  );
}
