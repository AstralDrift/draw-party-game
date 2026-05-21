import type { RoundResult, ScoreEntry } from './protocol';

type RoundOutcomeInput = Pick<RoundResult, 'breakdown' | 'correctVoterNames'>;

export function roundOutcomeText(result: RoundOutcomeInput): string {
  const totalVoters = new Set(result.breakdown.flatMap((item) => item.voterNames)).size;
  const correctVoters = result.correctVoterNames;

  if (correctVoters.length === 0) {
    return 'No one found it';
  }
  if (totalVoters > 0 && correctVoters.length === totalVoters) {
    return 'Everyone found it';
  }
  if (correctVoters.length === 1) {
    return `${correctVoters[0]} found it`;
  }
  if (correctVoters.length === 2) {
    return `${correctVoters[0]} and ${correctVoters[1]} found it`;
  }
  return `${correctVoters.length} players found it`;
}

export function finalWinnerText(scores: ScoreEntry[]): string {
  const topScore = scores[0]?.score;
  if (topScore === undefined) {
    return 'No scores yet';
  }

  const winners = scores.filter((score) => score.score === topScore);
  if (winners.length === 1) {
    return `${winners[0].name} wins`;
  }
  if (winners.length === 2) {
    return `${winners[0].name} and ${winners[1].name} tie`;
  }
  return `${winners.length} players tie`;
}
