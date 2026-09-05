import type { GamePhase } from './protocol';
import { musicSceneForPhase, PartyMusic } from './music';

type CueName = 'join' | 'phase' | 'submit' | 'results' | 'correct' | 'fooled' | 'podium' | 'tick';
export type SoundScope = 'display' | 'controller';
export type SoundMode = 'off' | 'effects' | 'full';

interface CueStep {
  frequency: number;
  offset: number;
  duration: number;
  gain: number;
  type: OscillatorType;
}

const CUE_PATTERNS: Record<CueName, CueStep[]> = {
  join: [
    { frequency: 523, offset: 0, duration: 0.13, gain: 0.045, type: 'sine' },
    { frequency: 659, offset: 0.07, duration: 0.16, gain: 0.05, type: 'triangle' },
    { frequency: 784, offset: 0.15, duration: 0.18, gain: 0.04, type: 'sine' }
  ],
  phase: [
    { frequency: 392, offset: 0, duration: 0.15, gain: 0.04, type: 'triangle' },
    { frequency: 784, offset: 0.08, duration: 0.18, gain: 0.05, type: 'triangle' }
  ],
  submit: [
    { frequency: 659, offset: 0, duration: 0.1, gain: 0.04, type: 'sine' },
    { frequency: 880, offset: 0.05, duration: 0.14, gain: 0.045, type: 'sine' }
  ],
  results: [
    { frequency: 587, offset: 0, duration: 0.16, gain: 0.045, type: 'triangle' },
    { frequency: 740, offset: 0.08, duration: 0.18, gain: 0.05, type: 'triangle' },
    { frequency: 988, offset: 0.18, duration: 0.28, gain: 0.045, type: 'sine' }
  ],
  correct: [
    { frequency: 523, offset: 0, duration: 0.12, gain: 0.05, type: 'triangle' },
    { frequency: 659, offset: 0.08, duration: 0.14, gain: 0.055, type: 'sine' },
    { frequency: 784, offset: 0.16, duration: 0.22, gain: 0.05, type: 'triangle' }
  ],
  fooled: [
    { frequency: 392, offset: 0, duration: 0.12, gain: 0.045, type: 'sawtooth' },
    { frequency: 311, offset: 0.1, duration: 0.18, gain: 0.04, type: 'triangle' },
    { frequency: 466, offset: 0.22, duration: 0.16, gain: 0.045, type: 'sine' }
  ],
  podium: [
    { frequency: 523, offset: 0, duration: 0.14, gain: 0.05, type: 'triangle' },
    { frequency: 659, offset: 0.1, duration: 0.16, gain: 0.05, type: 'sine' },
    { frequency: 784, offset: 0.2, duration: 0.18, gain: 0.055, type: 'triangle' },
    { frequency: 1046, offset: 0.34, duration: 0.28, gain: 0.05, type: 'sine' }
  ],
  tick: [{ frequency: 880, offset: 0, duration: 0.06, gain: 0.035, type: 'square' }]
};

let audioContext: AudioContext | null = null;
let mode = readSoundPreference();
let scope: SoundScope = 'display';
let music: PartyMusic | null = null;
let phase: GamePhase | null = null;
let unlocked = false;
const activeCues = new Map<OscillatorNode, GainNode>();
const playedKeys = new Set<string>();

function readSoundPreference(): SoundMode {
  try {
    const stored = localStorage.getItem('draw-party-audio');
    if (stored === 'off' || stored === 'effects' || stored === 'full') return stored;
    return localStorage.getItem('draw-party-sound') === 'on' ? 'effects' : 'off';
  } catch {
    return 'off';
  }
}

function persistSoundPreference(value: SoundMode): void {
  try {
    localStorage.setItem('draw-party-audio', value);
    localStorage.setItem('draw-party-sound', value === 'off' ? 'off' : 'on');
  } catch {
    // Sound remains available for this session when storage is unavailable.
  }
}

export function soundEnabled(): boolean {
  return mode !== 'off';
}

export function soundMode(): SoundMode { return mode; }

function syncMusic(): void {
  music?.setScene(mode === 'full' && scope === 'display' && unlocked &&
    audioContext?.state === 'running' && !document.hidden ? musicSceneForPhase(phase) : null);
}

/** Call from a gesture. Blocked or missing audio is an optional enhancement failure. */
export function unlockSound(): void {
  if (!soundEnabled() || typeof AudioContext === 'undefined') return;
  if (unlocked && audioContext?.state === 'running') return;
  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext();
      music = new PartyMusic(audioContext);
    }
    unlocked = true;
    void audioContext.resume().then(syncMusic).catch(() => { unlocked = false; music?.stop(); });
  } catch {
    unlocked = false;
  }
}

export function setSoundMode(next: SoundMode): void {
  mode = next;
  persistSoundPreference(mode);
  if (mode === 'off') {
    stopSound();
  } else {
    unlockSound();
    syncMusic();
  }
}

export function setSoundEnabled(nextEnabled: boolean): void {
  setSoundMode(nextEnabled ? 'effects' : 'off');
}

export function setSoundScope(nextScope: SoundScope): void {
  scope = nextScope;
  syncMusic();
}

export function setSoundPhase(next: GamePhase | null): void {
  phase = next;
  syncMusic();
}

export function stopSound(): void {
  music?.stop();
  for (const [oscillator, envelope] of activeCues) {
    oscillator.onended = null;
    try { oscillator.stop(); } catch { /* A browser may reject a note before it starts. */ }
    oscillator.disconnect();
    envelope.disconnect();
  }
  activeCues.clear();
}

export function playCue(name: CueName, key?: string): void {
  if (!soundEnabled() || !unlocked || phase === null || document.hidden ||
    (scope === 'controller' && name !== 'phase' && name !== 'submit') ||
    (key && playedKeys.has(key))) {
    return;
  }
  const context = audioContext;
  if (!context || context.state !== 'running') return;
  if (key) {
    playedKeys.add(key);
    if (playedKeys.size > 64) playedKeys.delete(playedKeys.values().next().value!);
  }
  music?.duck();
  const start = context.currentTime;
  try {
    CUE_PATTERNS[name].forEach((step) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = start + step.offset;
      oscillator.type = step.type;
      oscillator.frequency.value = step.frequency;
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(step.gain, noteStart + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + step.duration);
      oscillator.connect(gain).connect(context.destination);
      activeCues.set(oscillator, gain);
      oscillator.onended = () => {
        activeCues.delete(oscillator);
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(noteStart);
      oscillator.stop(noteStart + step.duration + 0.02);
    });
  } catch {
    stopSound();
  }
}
