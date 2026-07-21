import { describe, expect, it } from 'vitest';
import { optionLabel } from './option-label';

describe('optionLabel', () => {
  it('assigns stable A-H labels in option order', () => {
    expect(Array.from({ length: 8 }, (_, index) => optionLabel(index))).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H'
    ]);
  });
});
