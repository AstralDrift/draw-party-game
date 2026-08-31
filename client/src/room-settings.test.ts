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
        resultsSeconds: 10
      },
      {
        id: 'standard',
        rounds: 2,
        drawSeconds: 75,
        guessSeconds: 30,
        voteSeconds: 20,
        resultsSeconds: 10
      },
      {
        id: 'relaxed',
        rounds: 2,
        drawSeconds: 120,
        guessSeconds: 45,
        voteSeconds: 30,
        resultsSeconds: 12
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

  it('keeps an unsaved timer draft through an immediate prompt-pack acknowledgement', () => {
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
      const drawingInput = Array.from(container.querySelectorAll('label'))
        .find((label) => label.textContent?.includes('Drawing seconds'))
        ?.querySelector('input');
      const resultsInput = Array.from(container.querySelectorAll('label'))
        .find((label) => label.textContent?.includes('Results seconds'))
        ?.querySelector('input');
      const packSelect = container.querySelector('select');
      const applyButton = Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Apply custom settings')
      );
      const inputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set;
      if (!drawingInput || !resultsInput || !packSelect || !applyButton || !inputValueSetter) {
        throw new Error('Expected room settings controls');
      }
      expect(resultsInput.min).toBe('10');

      act(() => {
        inputValueSetter.call(drawingInput, '90');
        drawingInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });
      act(() => {
        packSelect.value = 'party-chaos';
        packSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(saved.at(-1)).toEqual({ ...initial, promptPackId: 'party-chaos' });

      render({ ...initial, promptPackId: 'party-chaos' });
      expect(drawingInput.value).toBe('90');

      act(() => {
        inputValueSetter.call(resultsInput, '6');
        resultsInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });

      act(() => applyButton.click());
      const applied = {
        ...initial,
        drawSeconds: 90,
        promptPackId: 'party-chaos'
      } satisfies RoomSettings;
      expect(saved.at(-1)).toEqual(applied);
      expect(resultsInput.value).toBe('10');

      render(applied);
      render({ ...initial, promptPackId: 'party-chaos' });
      expect(drawingInput.value).toBe('75');
    } finally {
      act(() => root.unmount());
    }
  });
});
