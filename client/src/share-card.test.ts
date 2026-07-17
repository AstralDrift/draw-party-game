import { describe, expect, it } from 'vitest';
import { drawShareCard, podiumShareLabel } from './share-card';

describe('share card', () => {
  it('labels download when Web Share is unavailable', () => {
    expect(podiumShareLabel()).toBe('Download Podium');
  });

  it('exports a canvas drawer for glass podium cards', () => {
    expect(typeof drawShareCard).toBe('function');
  });
});
