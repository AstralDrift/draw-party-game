import type { GamePhase } from './protocol';

export type MusicScene = 'play' | 'suspense' | null;
export function musicSceneForPhase(phase: GamePhase | null): MusicScene {
  if (phase === 'lobby' || phase === 'drawing') return 'play';
  if (phase === 'guessing' || phase === 'voting') return 'suspense';
  return null;
}

// Original eight-bar arrangements: sparse plucks, warm bass, and room for talking.
const CHORDS = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 57, 62]];
const PLAY = [76, 0, 79, 74, 0, 71, 74, 0, 72, 0, 76, 0, 79, 76, 0, 71];
const SUSPENSE = [69, 0, 72, 0, 71, 0, 64, 0, 69, 0, 76, 72, 0, 71, 0, 64];

export class PartyMusic {
  private scene: MusicScene = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private notes = new Map<OscillatorNode, GainNode>();
  private bus: GainNode;
  private nextAt = 0;
  private step = 0;

  constructor(private context: AudioContext) {
    this.bus = context.createGain();
    this.bus.gain.value = 0.6;
    this.bus.connect(context.destination);
  }

  setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    this.stop();
    this.scene = scene;
    if (!scene) return;
    this.step = 0;
    this.nextAt = this.context.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 100);
    this.schedule();
  }

  duck(): void {
    const now = this.context.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(0.18, now);
    this.bus.gain.setTargetAtTime(0.6, now + 0.6, 0.25);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.scene = null;
    for (const [oscillator, envelope] of this.notes) {
      oscillator.onended = null;
      try { oscillator.stop(); } catch { /* A rejected note may never have started. */ }
      oscillator.disconnect();
      envelope.disconnect();
    }
    this.notes.clear();
  }

  private note(midi: number, at: number, duration: number, volume: number, type: OscillatorType): void {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume, at + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope).connect(this.bus);
    this.notes.set(oscillator, envelope);
    oscillator.onended = () => {
      this.notes.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.03);
  }

  private schedule(): void {
    if (!this.scene || this.context.state !== 'running') return;
    const stepSeconds = this.scene === 'play' ? 60 / 96 / 2 : 60 / 112 / 2;
    if (this.nextAt < this.context.currentTime) {
      this.step += Math.ceil((this.context.currentTime - this.nextAt) / stepSeconds);
      this.nextAt = this.context.currentTime + 0.05;
    }
    try {
      while (this.nextAt < this.context.currentTime + 0.25) {
        const chord = CHORDS[Math.floor(this.step / 16) % CHORDS.length]!;
        const melody = this.scene === 'play' ? PLAY : SUSPENSE;
        const pitch = melody[this.step % melody.length]!;
        if (pitch) this.note(pitch, this.nextAt, 0.32, 0.018, 'sine');
        if (this.step % 4 === 0) this.note(this.scene === 'play' ? chord[0]! : 45, this.nextAt, 0.65, 0.025, 'triangle');
        if (this.scene === 'play' && this.step % 16 === 0) {
          for (const tone of chord.slice(1)) this.note(tone, this.nextAt, 1.8, 0.008, 'sine');
        }
        this.step += 1;
        this.nextAt += stepSeconds;
      }
    } catch {
      this.stop();
    }
  }
}
