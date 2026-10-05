/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const audioParam = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createGain() { return { gain: audioParam(), connect: vi.fn().mockReturnThis(), disconnect: vi.fn() }; }
  createOscillator() {
    const oscillator = { type: 'sine', frequency: { value: 0 }, connect: vi.fn().mockReturnThis(),
      start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null };
    oscillators.push(oscillator);
    return oscillator;
  }
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); localStorage.clear(); oscillators.length = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('party audio', () => {
  it('starts one music scheduler, ducks effects, and stops every note on mute', async () => {
    const sound = await import('./sound');
    sound.setSoundPhase('lobby');
    sound.setSoundMode('full');
    await Promise.resolve();
    const notes = oscillators.length;
    expect(notes).toBeGreaterThan(0);
    sound.setSoundPhase('lobby'); sound.unlockSound();
    await Promise.resolve();
    expect(oscillators.length).toBe(notes);
    expect(vi.getTimerCount()).toBe(1);
    sound.playCue('correct', 'turn:truth');
    const withCue = oscillators.length;
    sound.playCue('correct', 'turn:truth');
    expect(oscillators.length).toBe(withCue);
    sound.setSoundMode('off');
    expect(vi.getTimerCount()).toBe(0);
    expect(oscillators.every((node) => node.stop.mock.calls.length >= 2)).toBe(true);
  });

  it('never plays TV music on controllers and silences hidden or disconnected rooms', async () => {
    const sound = await import('./sound');
    sound.setSoundScope('controller'); sound.setSoundPhase('drawing'); sound.setSoundMode('full');
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
    sound.playCue('podium'); expect(oscillators).toHaveLength(0);
    sound.playCue('submit'); expect(oscillators.length).toBeGreaterThan(0);
    sound.stopSound();
    sound.setSoundScope('display'); sound.setSoundPhase('voting');
    expect(vi.getTimerCount()).toBe(1);
    sound.setSoundPhase(null);
    expect(vi.getTimerCount()).toBe(0);
    const disconnectedCount = oscillators.length;
    sound.playCue('correct', 'disconnected:truth');
    sound.playCue('tick');
    expect(oscillators).toHaveLength(disconnectedCount);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const count = oscillators.length;
    sound.setSoundPhase('drawing'); sound.playCue('phase');
    expect(oscillators).toHaveLength(count);
  });

  it('preserves legacy effects preference and tolerates missing or rejected audio', async () => {
    localStorage.setItem('draw-party-sound', 'on');
    const sound = await import('./sound');
    expect(sound.soundMode()).toBe('effects');
    vi.stubGlobal('AudioContext', undefined);
    expect(() => sound.setSoundMode('full')).not.toThrow();
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      resume = vi.fn().mockRejectedValue(new Error('Gesture required'));
    });
    sound.setSoundMode('full');
    await Promise.resolve(); await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => sound.playCue('phase')).not.toThrow();
  });

  it('stops the music scheduler if the browser rejects a note', async () => {
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      createOscillator() {
        const node = super.createOscillator();
        node.start.mockImplementation(() => { throw new Error('Audio device lost'); });
        node.stop.mockImplementation(() => { throw new Error('Note never started'); });
        return node;
      }
    });
    const sound = await import('./sound');
    sound.setSoundPhase('drawing');
    expect(() => sound.setSoundMode('full')).not.toThrow();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => sound.playCue('correct')).not.toThrow();
    expect(() => sound.setSoundMode('off')).not.toThrow();
  });

});
