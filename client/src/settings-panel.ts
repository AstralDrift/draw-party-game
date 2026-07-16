import { button, el } from './dom';
import {
  defaultRoomSettings,
  isPromptPackId,
  PROMPT_PACK_OPTIONS,
  type PromptPackId,
  type RoomSettings,
  type RoomSnapshot
} from './protocol';
import { setSoundEnabled, soundEnabled } from './sound';

export function renderSettingsPanel(options: {
  snapshot: RoomSnapshot | null;
  onSave: (settings: RoomSettings) => void;
  onToggleSound: () => void;
}): HTMLElement {
  const settings = options.snapshot?.settings ?? defaultRoomSettings();
  const rounds = numberInput(settings.rounds, 1, 12);
  const draw = numberInput(settings.drawSeconds, 30, 180);
  const guess = numberInput(settings.guessSeconds, 15, 120);
  const vote = numberInput(settings.voteSeconds, 10, 90);
  const results = numberInput(settings.resultsSeconds, 5, 30);
  const pack = el('select', { class: 'input compact-input' }) as HTMLSelectElement;
  for (const optionDef of PROMPT_PACK_OPTIONS) {
    const option = document.createElement('option');
    option.value = optionDef.id;
    option.textContent = optionDef.label;
    if (optionDef.id === settings.promptPackId) {
      option.selected = true;
    }
    pack.appendChild(option);
  }

  const save = () => {
    const packId: PromptPackId = isPromptPackId(pack.value) ? pack.value : 'safe-party';
    options.onSave({
      rounds: clampInput(rounds.value, 1, 12, settings.rounds),
      drawSeconds: clampInput(draw.value, 30, 180, settings.drawSeconds),
      guessSeconds: clampInput(guess.value, 15, 120, settings.guessSeconds),
      voteSeconds: clampInput(vote.value, 10, 90, settings.voteSeconds),
      resultsSeconds: clampInput(results.value, 5, 30, settings.resultsSeconds),
      promptPackId: packId
    });
  };

  return el(
    'section',
    { class: 'panel settings-panel' },
    el('div', { class: 'panel-title' }, 'Room Settings'),
    el('p', { class: 'muted panel-subtitle' }, 'Keep it quick for a loud room.'),
    el('label', { class: 'label' }, 'Rounds'),
    rounds,
    el('label', { class: 'label' }, 'Drawing seconds'),
    draw,
    el('label', { class: 'label' }, 'Guessing seconds'),
    guess,
    el('label', { class: 'label' }, 'Voting seconds'),
    vote,
    el('label', { class: 'label' }, 'Results seconds'),
    results,
    el('label', { class: 'label' }, 'Prompt pack'),
    pack,
    button('Save Settings', 'primary wide', save),
    button(
      soundEnabled() ? 'Sound On' : 'Sound Off',
      `tool-button wide sound-toggle ${soundEnabled() ? 'is-selected' : ''}`,
      () => {
        setSoundEnabled(!soundEnabled());
        options.onToggleSound();
      }
    )
  );
}

function numberInput(value: number, min: number, max: number): HTMLInputElement {
  return el('input', {
    class: 'input compact-input',
    type: 'number',
    min,
    max,
    value
  });
}

function clampInput(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}
