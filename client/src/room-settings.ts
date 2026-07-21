import type { PromptPackId, RoomSettings } from './protocol';

export type SettingsPresetId = 'quick' | 'standard' | 'relaxed';

type TimedRoomSettings = Omit<RoomSettings, 'promptPackId'>;

export const SETTINGS_PRESETS: ReadonlyArray<{
  id: SettingsPresetId;
  label: string;
  description: string;
  settings: TimedRoomSettings;
}> = [
  {
    id: 'quick',
    label: 'Quick',
    description: 'One fast round',
    settings: {
      rounds: 1,
      drawSeconds: 60,
      guessSeconds: 25,
      voteSeconds: 15,
      resultsSeconds: 6
    }
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Best for most parties',
    settings: {
      rounds: 2,
      drawSeconds: 75,
      guessSeconds: 30,
      voteSeconds: 20,
      resultsSeconds: 8
    }
  },
  {
    id: 'relaxed',
    label: 'Relaxed',
    description: 'More time to draw',
    settings: {
      rounds: 2,
      drawSeconds: 120,
      guessSeconds: 45,
      voteSeconds: 30,
      resultsSeconds: 12
    }
  }
];

export function roomSettingsForPreset(
  presetId: SettingsPresetId,
  promptPackId: PromptPackId
): RoomSettings {
  const preset = SETTINGS_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) {
    throw new Error(`Unknown room settings preset: ${presetId}`);
  }
  return { ...preset.settings, promptPackId };
}

export function activeSettingsPreset(settings: RoomSettings): SettingsPresetId | null {
  const preset = SETTINGS_PRESETS.find((candidate) =>
    (Object.keys(candidate.settings) as Array<keyof TimedRoomSettings>).every(
      (key) => candidate.settings[key] === settings[key]
    )
  );
  return preset?.id ?? null;
}
