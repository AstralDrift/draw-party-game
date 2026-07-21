import { describe, expect, it } from 'vitest';
import {
  deadlineUrgencyText,
  nextUrgentDeadlineAnnouncement
} from './deadline-urgency';

describe('deadlineUrgencyText', () => {
  it('adds a non-color countdown phrase for the final ten seconds', () => {
    expect(deadlineUrgencyText('0:10', true)).toBe('10 seconds left');
    expect(deadlineUrgencyText('0:01', true)).toBe('1 second left');
    expect(deadlineUrgencyText('0:00', true)).toBe('0 seconds left');
  });

  it('stays quiet outside the urgent window or for malformed labels', () => {
    expect(deadlineUrgencyText('0:10', false)).toBe('');
    expect(deadlineUrgencyText('0:11', true)).toBe('');
    expect(deadlineUrgencyText('', true)).toBe('');
  });

  it('announces urgency once per room turn, even when more time is added', () => {
    const first = nextUrgentDeadlineAnnouncement('ABCD', 4, '0:10', true, '');
    expect(first).toEqual({ announcedKey: 'ABCD:4', text: '10 seconds left' });
    expect(nextUrgentDeadlineAnnouncement('ABCD', 4, '0:09', true, first.announcedKey)).toEqual({
      announcedKey: 'ABCD:4',
      text: ''
    });
    expect(nextUrgentDeadlineAnnouncement('ABCD', 4, '0:40', false, first.announcedKey)).toEqual({
      announcedKey: 'ABCD:4',
      text: ''
    });
    expect(nextUrgentDeadlineAnnouncement('ABCD', 4, '0:10', true, first.announcedKey)).toEqual({
      announcedKey: 'ABCD:4',
      text: ''
    });
    expect(nextUrgentDeadlineAnnouncement('ABCD', 5, '0:08', true, first.announcedKey)).toEqual({
      announcedKey: 'ABCD:5',
      text: '8 seconds left'
    });
  });
});
