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
import { PlayerList } from '../../components/ui/PlayerList';
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
          <p className="eyebrow">
            {isHost ? `${displayName}, you're the host` : self ? `${displayName}, you're in` : "You're in"}
          </p>
          <h2>
            {spectating
              ? 'Watching the lobby'
              : ready
                ? isHost
                  ? 'Ready when you are'
                  : 'Party is ready'
                : 'Waiting for players'}
          </h2>
          {!editingName ? (
            <div className="lobby-name-row">
              <span className="muted">Playing as {displayName}</span>
              <Button variant="ghost" className="tool-button lobby-rename-button" onClick={startRename}>
                Edit name
              </Button>
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
          <div className="player-room-chip">
            <span>Room</span>
            <strong className="mini-room-code">{snapshot.roomCode}</strong>
          </div>
          <div className="player-ready-meter">
            <span className="ready-count">
              {connectedPlayers.length}/{snapshot.maxPlayers}
            </span>
            <span>
              {spectating
                ? 'You join as a player on the next drawing round.'
                : playerLobbyReadyNote(connectedPlayers.length, partyMinimum)}
            </span>
          </div>
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
              {practiceSupported ? (
                <Button
                  variant="secondary"
                  wide
                  icon={Pencil}
                  disabled={!canPractice}
                  onClick={() => send({ type: 'startPractice' })}
                >
                  Practice Drawing
                </Button>
              ) : null}
              <p className="muted">
                {canStartParty
                  ? practiceSupported
                    ? 'Party mode is ready. Practice is a score-free drawing warm-up.'
                    : 'Party mode is ready.'
                  : canPractice
                    ? `Party mode needs ${partyMinimum} players. Solo practice is ready now.`
                    : practiceSupported
                      ? `Party mode needs ${partyMinimum} players. Practice is for one connected phone.`
                      : `Party mode needs ${partyMinimum} players.`}
              </p>
            </>
          ) : (
            <p className="muted">
              {spectating
                ? 'You’re watching for now. You’ll draw next round.'
                : practiceSupported
                  ? 'Watch the TV. The host phone starts Party or Practice.'
                  : 'Watch the TV. The host phone starts Party.'}
            </p>
          )}
          <Button
            variant="ghost"
            wide
            icon={soundOn ? BellRing : BellOff}
            className={`sound-toggle turn-alert ${soundOn ? 'is-selected' : ''}`}
            aria-pressed={soundOn}
            onClick={toggleSound}
          >
            {soundOn ? 'Turn alerts: On' : 'Turn alerts: Off'}
          </Button>
          <p className="muted fine-print">Best effort while this tab is open</p>
        </GlassPanel>
        {isHost ? (
          <RoomSettingsPanel
            settings={snapshot.settings}
            onSave={updateSettings}
            subtitle="Choose a pace, then pick the prompt pack."
          />
        ) : null}
        <GlassPanel className="players-panel" tone="soft">
          <div className="panel-title">Players</div>
          <PlayerList players={snapshot.players} />
        </GlassPanel>
      </div>
    </Shell>
  );
}
