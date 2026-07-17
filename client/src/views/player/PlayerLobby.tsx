import { useState } from 'react';
import { useGame } from '../../app/GameProvider';
import { playerLobbyReadyNote } from '../../polish';
import { activePlayers } from '../../spectator';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/Field';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { PlayerList } from '../../components/ui/PlayerList';
import { RoomSettingsPanel } from '../../components/ui/RoomSettingsPanel';
import { Shell } from '../../components/ui/Shell';
import { SpectatorBanner } from '../../components/ui/SpectatorBanner';

export function PlayerLobby(): React.JSX.Element {
  const { snapshot, clientId, setName, send, updateSettings } = useGame();
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
  const neededPlayers = Math.max(0, snapshot.minPlayers - connectedPlayers.length);
  const self = snapshot.players.find((player) => player.id === clientId);
  const spectating = Boolean(self?.spectator);
  const isHost = Boolean(self?.isHost);
  const ready = neededPlayers === 0;
  const canStart = connectedPlayers.length >= snapshot.minPlayers;
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
                : playerLobbyReadyNote(connectedPlayers.length, snapshot.minPlayers)}
            </span>
          </div>
          {isHost ? (
            <>
              <Button
                className="spotlight-button"
                wide
                disabled={!canStart}
                onClick={() => send({ type: 'startGame' })}
              >
                Start Game
              </Button>
              <p className="muted">
                You’re running the lobby from this phone. The TV just shows the room.
              </p>
            </>
          ) : (
            <p className="muted">
              {spectating
                ? 'You’re watching for now. You’ll draw next round.'
                : 'Watch the TV. The host phone starts the game.'}
            </p>
          )}
        </GlassPanel>
        {isHost ? (
          <RoomSettingsPanel
            settings={snapshot.settings}
            onSave={updateSettings}
            subtitle="Timers and packs for this room."
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
