/**
 * @vitest-environment happy-dom
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomSettingsPanel } from './components/ui/RoomSettingsPanel';
import type { RoomSettings } from './protocol';
import {
  SETTINGS_PRESETS,
  activeSettingsPreset,
  roomSettingsForPreset,
  settingsPaceLabel
} from './room-settings';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  value: true
});

describe('room settings presets', () => {
  it('defines the bounded Quick, Standard, and Relaxed pacing', () => {
    expect(SETTINGS_PRESETS.map(({ id, settings }) => ({ id, ...settings }))).toEqual([
      {
        id: 'quick',
        rounds: 1,
        drawSeconds: 60,
        guessSeconds: 25,
        voteSeconds: 15,
        resultsSeconds: 12
      },
      {
        id: 'standard',
        rounds: 2,
        drawSeconds: 75,
        guessSeconds: 30,
        voteSeconds: 20,
        resultsSeconds: 14
      },
      {
        id: 'relaxed',
        rounds: 2,
        drawSeconds: 120,
        guessSeconds: 45,
        voteSeconds: 30,
        resultsSeconds: 15
      }
    ]);
  });

  it('preserves the selected prompt pack and recognizes authoritative presets', () => {
    const settings = roomSettingsForPreset('standard', 'party-chaos');
    expect(settings.promptPackId).toBe('party-chaos');
    expect(activeSettingsPreset(settings)).toBe('standard');
    expect(settingsPaceLabel(settings)).toBe('Standard');
    expect(activeSettingsPreset({ ...settings, voteSeconds: 21 })).toBeNull();
    expect(settingsPaceLabel({ ...settings, voteSeconds: 21 })).toBe('Custom');
  });

  it('keeps pacing when the prompt pack changes', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const saved: RoomSettings[] = [];
    const render = (settings: RoomSettings) => {
      act(() => {
        root.render(
          createElement(RoomSettingsPanel, {
            settings,
            onSave: (next) => {
              saved.push(next);
            }
          })
        );
      });
    };
    const initial = roomSettingsForPreset('standard', 'safe-party');

    try {
      render(initial);
      const packSelect = container.querySelector('select');
      if (!packSelect) {
        throw new Error('Expected prompt pack select');
      }
      expect(container.querySelector('.settings-advanced')).toBeNull();

      act(() => {
        packSelect.value = 'party-chaos';
        packSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(saved.at(-1)).toEqual({ ...initial, promptPackId: 'party-chaos' });
    } finally {
      act(() => root.unmount());
    }
  });
});
