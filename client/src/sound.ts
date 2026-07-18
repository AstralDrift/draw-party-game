type CueName = 'join' | 'phase' | 'submit' | 'results' | 'correct' | 'fooled' | 'podium' | 'tick';

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
let enabled = readSoundPreference();

function readSoundPreference(): boolean {
  try {
    return localStorage.getItem('draw-party-sound') === 'on';
  } catch {
    return false;
  }
}

function persistSoundPreference(value: boolean): void {
  try {
    localStorage.setItem('draw-party-sound', value ? 'on' : 'off');
  } catch {
    // Sound remains available for this session when storage is unavailable.
  }
}

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(nextEnabled: boolean): void {
  enabled = nextEnabled;
  persistSoundPreference(enabled);
  if (enabled) {
    audioContext = audioContext ?? new AudioContext();
    void audioContext.resume();
  }
}

export function playCue(name: CueName): void {
  if (!enabled) {
    return;
  }
  audioContext = audioContext ?? new AudioContext();
  const context = audioContext;
  void context.resume();
  const start = context.currentTime;
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
    oscillator.start(noteStart);
    oscillator.stop(noteStart + step.duration + 0.02);
  });
}
