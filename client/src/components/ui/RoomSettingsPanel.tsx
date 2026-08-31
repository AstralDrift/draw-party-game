import { Volume2, VolumeX } from 'lucide';
import {
  PROMPT_PACK_OPTIONS,
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
import { Field, TextSelect } from './Field';
import { GlassPanel } from './GlassPanel';

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
  subtitle
}: RoomSettingsPanelProps): React.JSX.Element {
  const packId = settings.promptPackId;
  const selectedPresetId = activeSettingsPreset(settings);

  const applyPreset = (presetId: SettingsPresetId) => {
    onSave(roomSettingsForPreset(presetId, packId));
  };

  const applyPack = (promptPackId: PromptPackId) => {
    onSave({ ...settings, promptPackId });
  };

  return (
    <GlassPanel className="settings-panel" tone="soft">
      {subtitle ? <p className="muted panel-subtitle">{subtitle}</p> : null}
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
            applyPack(event.target.value);
          }}
        >
          {PROMPT_PACK_OPTIONS.map((pack) => (
            <option key={pack.id} value={pack.id}>
              {pack.label}
            </option>
          ))}
        </TextSelect>
      </Field>
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
