import { describe, expect, it } from 'vitest';
import { finalWinnerText, roundHighlightCards, roundOutcomeText } from './polish';
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

  it('turns a reveal into party highlight cards', () => {
    expect(
      roundHighlightCards({
        artistId: 'artist',
        artistName: 'Ada',
        correctAnswer: 'vampire dentist',
        correctVoterNames: [],
        breakdown: [
          {
            optionId: 'truth',
            optionText: 'vampire dentist',
            voterNames: [],
            isCorrect: true,
            authorName: null
          },
          {
            optionId: 'fake',
            optionText: 'a haunted toothbrush',
            voterNames: ['Ava', 'Bo'],
            isCorrect: false,
            authorName: 'Cy'
          }
        ],
        scoreDeltas: [
          { playerId: 'artist', name: 'Ada', delta: 0 },
          { playerId: 'cy', name: 'Cy', delta: 100 }
        ]
      })
    ).toEqual([
      {
        label: 'Table stumper',
        title: 'Nobody found the real prompt',
        detail: 'The room got completely fooled.',
        tone: 'truth'
      },
      {
        label: 'Best fake',
        title: "Cy's bluff",
        detail: '“a haunted toothbrush” pulled 2 votes.',
        tone: 'fake'
      },
      {
        label: 'Biggest jump',
        title: 'Cy +100',
        detail: 'Largest score gain this reveal.',
        tone: 'score'
      }
    ]);
  });

  it('celebrates clean sweeps without inventing a fake-answer highlight', () => {
    const highlights = roundHighlightCards({
      artistId: 'artist',
      artistName: 'Ada',
      correctAnswer: 'robot doing yoga',
      correctVoterNames: ['Ava', 'Bo'],
      breakdown: [
        {
          optionId: 'truth',
          optionText: 'robot doing yoga',
          voterNames: ['Ava', 'Bo'],
          isCorrect: true,
          authorName: null
        },
        {
          optionId: 'fake',
          optionText: 'a sleepy toaster',
          voterNames: [],
          isCorrect: false,
          authorName: 'Cy'
        }
      ],
      scoreDeltas: [
        { playerId: 'artist', name: 'Ada', delta: 200 },
        { playerId: 'ava', name: 'Ava', delta: 200 },
        { playerId: 'bo', name: 'Bo', delta: 200 }
      ]
    });

    expect(highlights).toContainEqual({
      label: 'Clean sweep',
      title: 'Everyone found it',
      detail: 'The fakes did not stand a chance.',
      tone: 'truth'
    });
    expect(highlights.some((highlight) => highlight.label === 'Best fake')).toBe(false);
    expect(highlights).toContainEqual({
      label: 'Biggest jump',
      title: '3 players +200',
      detail: 'Ada, Ava, and Bo had the largest score gain this reveal.',
      tone: 'score'
    });
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
