import { useMemo, useState } from 'react';
import {
  defaultRoomSettings,
  isPromptPackId,
  type PromptPackId,
  type RoomSettings
} from '../../protocol';
import { Button } from './Button';
import { Field, TextInput, TextSelect } from './Field';
import { GlassPanel } from './GlassPanel';

function clamp(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

interface RoomSettingsPanelProps {
  settings: RoomSettings;
  onSave: (settings: RoomSettings) => void;
  soundOn?: boolean;
  onToggleSound?: () => void;
  subtitle?: string;
}

export function RoomSettingsPanel({
  settings,
  onSave,
  soundOn,
  onToggleSound,
  subtitle = 'Keep it quick for a loud room.'
}: RoomSettingsPanelProps): React.JSX.Element {
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
      <p className="muted panel-subtitle">{subtitle}</p>
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
        <TextSelect
          value={packId}
          onChange={(event) => setPackId(isPromptPackId(event.target.value) ? event.target.value : 'safe-party')}
        >
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
            resultsSeconds: clamp(resultsSeconds, 5, 30, settings.resultsSeconds ?? defaults.resultsSeconds),
            promptPackId: packId
          })
        }
      >
        Save Settings
      </Button>
      {onToggleSound ? (
        <Button
          variant="secondary"
          wide
          className={`sound-toggle ${soundOn ? 'is-selected' : ''}`}
          aria-pressed={soundOn}
          onClick={onToggleSound}
        >
          {soundOn ? 'Sound On' : 'Sound Off'}
        </Button>
      ) : null}
    </GlassPanel>
  );
}
