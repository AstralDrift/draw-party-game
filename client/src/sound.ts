type CueName = 'join' | 'phase' | 'submit' | 'results';

const CUE_FREQUENCIES: Record<CueName, [number, number]> = {
  join: [523, 659],
  phase: [392, 784],
  submit: [659, 880],
  results: [587, 988]
};

let audioContext: AudioContext | null = null;
let enabled = localStorage.getItem('draw-party-sound') === 'on';

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(nextEnabled: boolean): void {
  enabled = nextEnabled;
  localStorage.setItem('draw-party-sound', enabled ? 'on' : 'off');
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
  CUE_FREQUENCIES[name].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start + index * 0.06);
    gain.gain.linearRampToValueAtTime(0.05, start + index * 0.06 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + index * 0.06 + 0.15);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + index * 0.06);
    oscillator.stop(start + index * 0.06 + 0.16);
  });
}
