import { useMemo, useState } from 'react';
import { useGame } from '../../app/GameProvider';
import {
  defaultRoomSettings,
  isPromptPackId,
  type PromptPackId,
  type RoomSettings
} from '../../protocol';
import { activePlayers, playerCountLabel } from '../../spectator';
import { Button } from '../../components/ui/Button';
import { Field, TextInput, TextSelect } from '../../components/ui/Field';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { PlayerList } from '../../components/ui/PlayerList';
import { QrCode } from '../../components/ui/QrCode';

function clamp(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function DisplayLobby(): React.JSX.Element {
  const { snapshot, send, updateSettings, soundOn, toggleSound } = useGame();
  if (!snapshot) {
    return <GlassPanel>Connecting…</GlassPanel>;
  }

  const joinUrl = `${window.location.origin}/join/${snapshot.roomCode}`;
  const connectedPlayers = activePlayers(snapshot.players);
  const canStart = connectedPlayers.length >= snapshot.minPlayers;
  const neededPlayers = Math.max(0, snapshot.minPlayers - connectedPlayers.length);
  const settings = snapshot.settings;

  return (
    <div className="display-grid display-grid-lobby">
      <GlassPanel className="room-panel">
        <div className="room-hero-copy">
          <p className="eyebrow">Scan to play</p>
          <h2>Everybody draws. Everybody lies.</h2>
          <p className="muted room-hero-sub">Phones scan the QR or type the code. First laugh in under a minute.</p>
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
          {canStart
            ? `${connectedPlayers.length} ready — hit Start when the couch is full.`
            : connectedPlayers.length === 0
              ? `Scan the QR (or type the code). Need ${snapshot.minPlayers}+ phones.`
              : `Need ${neededPlayers} more phone${neededPlayers === 1 ? '' : 's'} before kickoff.`}
        </p>
      </GlassPanel>

      <div className="lobby-side">
        <GlassPanel className="players-panel" tone="soft">
          <div className="panel-title">Players</div>
          <PlayerList players={snapshot.players} showScores />
          <p className="muted">{playerCountLabel(snapshot.players, snapshot.maxPlayers)}</p>
        </GlassPanel>
        <SettingsPanel settings={settings} onSave={updateSettings} soundOn={soundOn} onToggleSound={toggleSound} />
      </div>
    </div>
  );
}

function SettingsPanel({
  settings,
  onSave,
  soundOn,
  onToggleSound
}: {
  settings: RoomSettings;
  onSave: (settings: RoomSettings) => void;
  soundOn: boolean;
  onToggleSound: () => void;
}): React.JSX.Element {
  const defaults = useMemo(() => defaultRoomSettings(), []);
  const [rounds, setRounds] = useState(String(settings.rounds));
  const [drawSeconds, setDrawSeconds] = useState(String(settings.drawSeconds));
  const [guessSeconds, setGuessSeconds] = useState(String(settings.guessSeconds));
  const [voteSeconds, setVoteSeconds] = useState(String(settings.voteSeconds));
  const [resultsSeconds, setResultsSeconds] = useState(String(settings.resultsSeconds ?? defaults.resultsSeconds));
  const [packId, setPackId] = useState<PromptPackId>(settings.promptPackId);

  return (
    <GlassPanel className="settings-panel" tone="soft">
      <div className="panel-title">Room Settings</div>
      <p className="muted panel-subtitle">Keep it quick for a loud room.</p>
      <Field label="Rounds">
        <TextInput
          className="compact-input"
          type="number"
          min={1}
          max={12}
          value={rounds}
          onChange={(event) => setRounds(event.target.value)}
        />
      </Field>
      <Field label="Drawing seconds">
        <TextInput
          className="compact-input"
          type="number"
          min={30}
          max={180}
          value={drawSeconds}
          onChange={(event) => setDrawSeconds(event.target.value)}
        />
      </Field>
      <Field label="Guessing seconds">
        <TextInput
          className="compact-input"
          type="number"
          min={15}
          max={120}
          value={guessSeconds}
          onChange={(event) => setGuessSeconds(event.target.value)}
        />
      </Field>
      <Field label="Voting seconds">
        <TextInput
          className="compact-input"
          type="number"
          min={10}
          max={90}
          value={voteSeconds}
          onChange={(event) => setVoteSeconds(event.target.value)}
        />
      </Field>
      <Field label="Results seconds">
        <TextInput
          className="compact-input"
          type="number"
          min={5}
          max={30}
          value={resultsSeconds}
          onChange={(event) => setResultsSeconds(event.target.value)}
        />
      </Field>
      <Field label="Prompt pack">
        <TextSelect value={packId} onChange={(event) => setPackId(isPromptPackId(event.target.value) ? event.target.value : 'safe-party')}>
          <option value="safe-party">Party Safe</option>
          <option value="party-chaos">Party Chaos</option>
        </TextSelect>
      </Field>
      <Button
        wide
        onClick={() =>
          onSave({
            rounds: clamp(rounds, 1, 12, settings.rounds),
            drawSeconds: clamp(drawSeconds, 30, 180, settings.drawSeconds),
            guessSeconds: clamp(guessSeconds, 15, 120, settings.guessSeconds),
            voteSeconds: clamp(voteSeconds, 10, 90, settings.voteSeconds),
            resultsSeconds: clamp(resultsSeconds, 5, 30, settings.resultsSeconds ?? 12),
            promptPackId: packId
          })
        }
      >
        Save Settings
      </Button>
      <Button
        variant="secondary"
        wide
        className={`sound-toggle ${soundOn ? 'is-selected' : ''}`}
        onClick={onToggleSound}
      >
        {soundOn ? 'Sound On' : 'Sound Off'}
      </Button>
    </GlassPanel>
  );
}
