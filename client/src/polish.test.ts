import { describe, expect, it } from 'vitest';
import {
  competitionRank,
  displayLobbyStartNote,
  finalWinnerText,
  playerActionHint,
  playerLobbyReadyNote,
  podiumTitles,
  rematchPrompt,
  roundOutcomeText
} from './polish';
import type { RoundResult, ScoreEntry } from './protocol';

describe('party polish copy', () => {
  it('summarizes round outcomes from correct voters', () => {
    expect(roundOutcomeText(roundResult([], ['Ava', 'Bo'], { nobodyFoundIt: true }))).toBe(
      'Nobody got it — artist wins the room'
    );
    expect(roundOutcomeText(roundResult(['Ava'], ['Ava', 'Bo']))).toBe('Ava cracked it');
    expect(roundOutcomeText(roundResult(['Ava', 'Bo'], ['Ava', 'Bo'], { perfectTruth: true }))).toBe(
      'Everyone saw through it — perfect!'
    );
    expect(roundOutcomeText(roundResult(['Ava', 'Bo'], ['Ava', 'Bo', 'Cy']))).toBe(
      'Ava and Bo cracked it'
    );
    expect(roundOutcomeText(roundResult(['Ava', 'Bo', 'Cy'], ['Ava', 'Bo', 'Cy']))).toBe(
      '3 players cracked it'
    );
    expect(roundOutcomeText(roundResult([], [], {}))).toBe('Nobody got it — artist wins the room');
  });

  it('summarizes final winners and ties', () => {
    expect(finalWinnerText(scores([]))).toBe('No scores yet');
    expect(finalWinnerText(scores([['Ava', 450], ['Bo', 200]]))).toBe('Ava wins');
    expect(finalWinnerText(scores([['Ava', 300], ['Bo', 300]]))).toBe('Ava and Bo tie');
    expect(finalWinnerText(scores([['Ava', 100], ['Bo', 100], ['Cy', 100]]))).toBe('3 players tie');
    expect(rematchPrompt(scores([]))).toBe('One more masterpiece?');
    expect(rematchPrompt(scores([['Ava', 0]]))).toBe('One more masterpiece?');
    expect(rematchPrompt(scores([['Ava', 450], ['Bo', 300]]))).toBe(
      'Ava won by 150—take it back?'
    );
    expect(rematchPrompt(scores([['Ava', 300], ['Bo', 300], ['Cy', 100]]))).toBe(
      'Ava and Bo tied—settle it?'
    );
    expect(rematchPrompt(scores([['Ava', 100], ['Bo', 100], ['Cy', 100]]))).toBe(
      '3 players tied—settle it?'
    );
  });

  it('guides hosts toward a fuller party while keeping solo startable', () => {
    expect(displayLobbyStartNote(0, 1)).toBe('Scan the QR (or type the code). Need 1+ phones.');
    expect(displayLobbyStartNote(1, 3)).toBe('Need 2 more phones before kickoff.');
    expect(displayLobbyStartNote(1, 1)).toBe(
      '1 ready — playable now, best with 3+ for votes and fakes.'
    );
    expect(displayLobbyStartNote(2, 1)).toBe(
      '2 ready — playable now, best with 3+ for votes and fakes.'
    );
    expect(displayLobbyStartNote(3, 1)).toBe('3 ready — hit Start when the couch is full.');
    expect(playerLobbyReadyNote(0, 1)).toBe('Need 1 more player.');
    expect(playerLobbyReadyNote(1, 1)).toBe('Invite 2 more for better voting.');
    expect(playerLobbyReadyNote(2, 1)).toBe('Invite 1 more for better voting.');
    expect(playerLobbyReadyNote(3, 1)).toBe('The TV can start the game.');
  });

  it('assigns podium titles and phase action hints', () => {
    expect(podiumTitles([])).toEqual([]);
    expect(podiumTitles(scores([['Ava', 10]]))).toEqual([{ playerId: 'p0', title: 'Champion' }]);
    const four = scores([
      ['Ava', 400],
      ['Bo', 300],
      ['Cy', 200],
      ['Di', 50]
    ]);
    expect(podiumTitles(four)).toEqual([
      { playerId: 'p0', title: 'Champion' },
      { playerId: 'p1', title: 'Runner-up' },
      { playerId: 'p2', title: 'Third Place' }
    ]);
    expect(podiumTitles(four).some((title) => title.title === 'Dark Horse')).toBe(false);
    expect(podiumTitles(four).some((title) => title.title === 'Crowd Favorite')).toBe(false);

    const tied = scores([
      ['Ava', 400],
      ['Bo', 400],
      ['Cy', 200],
      ['Di', 200],
      ['Eli', 50]
    ]);
    expect(tied.map((score) => competitionRank(tied, score))).toEqual([1, 1, 3, 3, 5]);
    expect(podiumTitles(tied)).toEqual([
      { playerId: 'p0', title: 'Champion' },
      { playerId: 'p1', title: 'Champion' },
      { playerId: 'p2', title: 'Third Place' },
      { playerId: 'p3', title: 'Third Place' }
    ]);
    expect(podiumTitles(tied).some((title) => title.title === 'Runner-up')).toBe(false);

    expect(playerActionHint('voting', true)).toMatch(/can’t vote/);
    expect(playerActionHint('guessing', false)).toMatch(/Fooling people/);
    expect(playerActionHint('finalScores', false)).toMatch(/podium/);
  });
});

function roundResult(
  correctVoterNames: string[],
  voterNames: string[],
  flags: Partial<Pick<RoundResult, 'nobodyFoundIt' | 'perfectTruth'>> = {}
): Pick<RoundResult, 'breakdown' | 'correctVoterNames' | 'nobodyFoundIt' | 'perfectTruth'> {
  return {
    correctVoterNames,
    nobodyFoundIt: flags.nobodyFoundIt ?? false,
    perfectTruth: flags.perfectTruth ?? false,
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
