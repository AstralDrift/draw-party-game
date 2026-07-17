import { describe, expect, it } from 'vitest';
import {
  displayLobbyStartNote,
  finalWinnerText,
  playerLobbyReadyNote,
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
    expect(roundOutcomeText(roundResult(['Ava', 'Bo'], ['Ava', 'Bo', 'Cy']))).toBe('Ava and Bo cracked it');
  });

  it('summarizes final winners and ties', () => {
    expect(finalWinnerText(scores([]))).toBe('No scores yet');
    expect(finalWinnerText(scores([['Ava', 450], ['Bo', 200]]))).toBe('Ava wins');
    expect(finalWinnerText(scores([['Ava', 300], ['Bo', 300]]))).toBe('Ava and Bo tie');
    expect(finalWinnerText(scores([['Ava', 100], ['Bo', 100], ['Cy', 100]]))).toBe('3 players tie');
  });

  it('guides hosts toward a fuller party while keeping solo startable', () => {
    expect(displayLobbyStartNote(0, 1)).toBe('Scan the QR (or type the code). Need 1+ phones.');
    expect(displayLobbyStartNote(1, 1)).toBe(
      '1 ready — playable now, best with 3+ for votes and fakes.'
    );
    expect(displayLobbyStartNote(2, 1)).toBe(
      '2 ready — playable now, best with 3+ for votes and fakes.'
    );
    expect(displayLobbyStartNote(3, 1)).toBe('3 ready — hit Start when the couch is full.');
    expect(playerLobbyReadyNote(1, 1)).toBe('Invite 2 more for better voting.');
    expect(playerLobbyReadyNote(2, 1)).toBe('Invite 1 more for better voting.');
    expect(playerLobbyReadyNote(3, 1)).toBe('The TV can start the game.');
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
