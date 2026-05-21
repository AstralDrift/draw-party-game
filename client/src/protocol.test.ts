import { describe, expect, it } from 'vitest';
import { isServerMessage, phaseLabel } from './protocol';

describe('protocol helpers', () => {
  it('recognizes tagged server messages', () => {
    expect(isServerMessage({ type: 'pong', nowMs: 123 })).toBe(true);
    expect(isServerMessage({ nowMs: 123 })).toBe(false);
    expect(isServerMessage(null)).toBe(false);
  });

  it('labels phases for UI chrome', () => {
    expect(phaseLabel('finalScores')).toBe('Final Scores');
    expect(phaseLabel('drawing')).toBe('Drawing');
  });
});
