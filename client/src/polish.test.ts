import { describe, expect, it } from 'vitest';
import { finalWinnerText, roundOutcomeText } from './polish';
import type { RoundResult, ScoreEntry } from './protocol';

describe('party polish copy', () => {
  it('summarizes round outcomes from correct voters', () => {
    expect(roundOutcomeText(roundResult([], ['Ava', 'Bo']))).toBe('No one found it');
    expect(roundOutcomeText(roundResult(['Ava'], ['Ava', 'Bo']))).toBe('Ava found it');
    expect(roundOutcomeText(roundResult(['Ava', 'Bo'], ['Ava', 'Bo']))).toBe('Everyone found it');
    expect(roundOutcomeText(roundResult(['Ava', 'Bo'], ['Ava', 'Bo', 'Cy']))).toBe('Ava and Bo found it');
  });

  it('summarizes final winners and ties', () => {
    expect(finalWinnerText(scores([]))).toBe('No scores yet');
    expect(finalWinnerText(scores([['Ava', 450], ['Bo', 200]]))).toBe('Ava wins');
    expect(finalWinnerText(scores([['Ava', 300], ['Bo', 300]]))).toBe('Ava and Bo tie');
    expect(finalWinnerText(scores([['Ava', 100], ['Bo', 100], ['Cy', 100]]))).toBe('3 players tie');
  });
});

function roundResult(correctVoterNames: string[], voterNames: string[]): Pick<RoundResult, 'breakdown' | 'correctVoterNames'> {
  return {
    correctVoterNames,
    breakdown: [
      {
        optionId: 'option-0',
        optionText: 'correct',
        voterNames,
        isCorrect: true,
        authorName: null
      }
    ]
  };
}

function scores(entries: Array<[string, number]>): ScoreEntry[] {
  return entries.map(([name, score], index) => ({
    playerId: `p${index}`,
    name,
    score
  }));
}
