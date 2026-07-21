import { useEffect, useMemo, useRef, useState } from 'react';
import { Save, Volume2, VolumeX } from 'lucide';
import {
  PROMPT_PACK_OPTIONS,
  defaultRoomSettings,
  isPromptPackId,
  type PromptPackId,
  type RoomSettings
} from '../../protocol';
import {
  SETTINGS_PRESETS,
  activeSettingsPreset,
  roomSettingsForPreset,
  type SettingsPresetId
} from '../../room-settings';
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

const NUMERIC_SETTING_FIELDS = [
  { key: 'rounds', label: 'Rounds', min: 1, max: 3 },
  { key: 'drawSeconds', label: 'Drawing seconds', min: 45, max: 120 },
  { key: 'guessSeconds', label: 'Guessing seconds', min: 20, max: 60 },
  { key: 'voteSeconds', label: 'Voting seconds', min: 15, max: 40 },
  { key: 'resultsSeconds', label: 'Results seconds', min: 10, max: 15 }
] as const;

type NumericSettingKey = (typeof NUMERIC_SETTING_FIELDS)[number]['key'];
type NumericSettingsDraft = Readonly<Record<NumericSettingKey, string>>;

function numericDraftFromSettings(settings: RoomSettings): NumericSettingsDraft {
  return {
    rounds: String(settings.rounds),
    drawSeconds: String(settings.drawSeconds),
    guessSeconds: String(settings.guessSeconds),
    voteSeconds: String(settings.voteSeconds),
    resultsSeconds: String(settings.resultsSeconds)
  };
}

interface RoomSettingsPanelProps {
  readonly settings: RoomSettings;
  readonly onSave: (settings: RoomSettings) => void;
  readonly soundOn?: boolean;
  readonly onToggleSound?: () => void;
  readonly subtitle?: string;
}

export function RoomSettingsPanel({
  settings,
  onSave,
  soundOn,
  onToggleSound,
  subtitle = 'Keep it quick for a loud room.'
}: RoomSettingsPanelProps): React.JSX.Element {
  const defaults = useMemo(() => defaultRoomSettings(), []);
  const [numericDraft, setNumericDraft] = useState<NumericSettingsDraft>(() =>
    numericDraftFromSettings({
      ...settings,
      resultsSeconds: settings.resultsSeconds ?? defaults.resultsSeconds
    })
  );
  const [packId, setPackId] = useState<PromptPackId>(settings.promptPackId);
  const [selectedPresetId, setSelectedPresetId] = useState<SettingsPresetId | null>(() =>
    activeSettingsPreset(settings)
  );
  const appliedSettingsRef = useRef<RoomSettings>({
    ...settings,
    resultsSeconds: settings.resultsSeconds ?? defaults.resultsSeconds
  });
  const numericDraftDirtyRef = useRef(false);
  const appliedCustomSettingsRef = useRef<RoomSettings | null>(null);

  useEffect(() => {
    const authoritativeSettings: RoomSettings = {
      ...settings,
      resultsSeconds: settings.resultsSeconds ?? defaults.resultsSeconds
    };
    const appliedCustomSettings = appliedCustomSettingsRef.current;
    const customSettingsConfirmed =
      appliedCustomSettings !== null &&
      appliedCustomSettings.rounds === authoritativeSettings.rounds &&
      appliedCustomSettings.drawSeconds === authoritativeSettings.drawSeconds &&
      appliedCustomSettings.guessSeconds === authoritativeSettings.guessSeconds &&
      appliedCustomSettings.voteSeconds === authoritativeSettings.voteSeconds &&
      appliedCustomSettings.resultsSeconds === authoritativeSettings.resultsSeconds;
    if (!numericDraftDirtyRef.current || customSettingsConfirmed) {
      setNumericDraft(numericDraftFromSettings(authoritativeSettings));
      setSelectedPresetId(activeSettingsPreset(authoritativeSettings));
      numericDraftDirtyRef.current = false;
      appliedCustomSettingsRef.current = null;
    }
    setPackId(authoritativeSettings.promptPackId);
    appliedSettingsRef.current = authoritativeSettings;
  }, [defaults.resultsSeconds, settings]);

  const updateNumericDraft = (key: NumericSettingKey, value: string) => {
    numericDraftDirtyRef.current = true;
    appliedCustomSettingsRef.current = null;
    setSelectedPresetId(null);
    setNumericDraft((current) => ({ ...current, [key]: value }));
  };

  const applyPreset = (presetId: SettingsPresetId) => {
    const next = roomSettingsForPreset(presetId, packId);
    setNumericDraft(numericDraftFromSettings(next));
    setSelectedPresetId(presetId);
    numericDraftDirtyRef.current = false;
    appliedCustomSettingsRef.current = null;
    appliedSettingsRef.current = next;
    onSave(next);
  };

  const saveAdvancedSettings = () => {
    const next: RoomSettings = {
      rounds: clamp(numericDraft.rounds, 1, 3, settings.rounds),
      drawSeconds: clamp(numericDraft.drawSeconds, 45, 120, settings.drawSeconds),
      guessSeconds: clamp(numericDraft.guessSeconds, 20, 60, settings.guessSeconds),
      voteSeconds: clamp(numericDraft.voteSeconds, 15, 40, settings.voteSeconds),
      resultsSeconds: clamp(
        numericDraft.resultsSeconds,
        10,
        15,
        settings.resultsSeconds ?? defaults.resultsSeconds
      ),
      promptPackId: packId
    };
    setNumericDraft(numericDraftFromSettings(next));
    setSelectedPresetId(activeSettingsPreset(next));
    numericDraftDirtyRef.current = true;
    appliedCustomSettingsRef.current = next;
    appliedSettingsRef.current = next;
    onSave(next);
  };

  return (
    <GlassPanel className="settings-panel" tone="soft">
      <div className="panel-title">Room Settings</div>
      <p className="muted panel-subtitle">{subtitle}</p>
      <div className="settings-presets" role="group" aria-label="Pacing preset">
        {SETTINGS_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`settings-preset ${selectedPresetId === preset.id ? 'is-selected' : ''}`}
            aria-pressed={selectedPresetId === preset.id}
            aria-label={`${preset.label}: ${preset.description}`}
            title={preset.description}
            onClick={() => applyPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <Field label="Prompt pack">
        <TextSelect
          value={packId}
          onChange={(event) => {
            if (!isPromptPackId(event.target.value)) {
              return;
            }
            const next = {
              ...appliedSettingsRef.current,
              promptPackId: event.target.value
            };
            setPackId(event.target.value);
            appliedSettingsRef.current = next;
            onSave(next);
          }}
        >
          {PROMPT_PACK_OPTIONS.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.label}
            </option>
          ))}
        </TextSelect>
      </Field>
      <details className="settings-advanced">
        <summary>Advanced</summary>
        <div className="join-form">
          {NUMERIC_SETTING_FIELDS.map((field) => (
            <Field key={field.key} label={field.label}>
              <TextInput
                className="compact-input"
                type="number"
                min={field.min}
                max={field.max}
                value={numericDraft[field.key]}
                onChange={(event) => updateNumericDraft(field.key, event.target.value)}
              />
            </Field>
          ))}
          <Button wide icon={Save} onClick={saveAdvancedSettings}>
            Apply custom settings
          </Button>
        </div>
      </details>
      {onToggleSound ? (
        <Button
          variant="secondary"
          wide
          icon={soundOn ? Volume2 : VolumeX}
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
