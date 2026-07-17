import { describe, expect, it } from 'vitest';
import { podiumShareLabel } from './share-card';

describe('share card', () => {
  it('labels download when Web Share is unavailable', () => {
    expect(podiumShareLabel()).toBe('Download Podium');
  });
});
