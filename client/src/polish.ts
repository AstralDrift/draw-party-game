import type { GamePhase, RoundResult, ScoreEntry } from './protocol';

type RoundOutcomeInput = Pick<
  RoundResult,
  'breakdown' | 'correctVoterNames' | 'nobodyFoundIt' | 'perfectTruth'
>;

export function roundOutcomeText(result: RoundOutcomeInput): string {
  if (result.nobodyFoundIt) {
    return 'No one found it';
  }
  if (result.perfectTruth) {
    return 'Everyone found it — perfect!';
  }

  const correctVoters = result.correctVoterNames;
  if (correctVoters.length === 1) {
    return `${correctVoters[0]} found it`;
  }
  if (correctVoters.length === 2) {
    return `${correctVoters[0]} and ${correctVoters[1]} found it`;
  }
  if (correctVoters.length > 2) {
    return `${correctVoters.length} players found it`;
  }
  return 'No one found it';
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

export function playerActionHint(phase: GamePhase, isArtist: boolean): string {
  switch (phase) {
    case 'lobby':
      return 'Wait for the TV host to start the game.';
    case 'drawing':
      return 'Draw your secret prompt, then submit.';
    case 'guessing':
      return isArtist ? 'Your drawing is up. Sit back while others invent titles.' : 'Write a fake title that could fool the room.';
    case 'voting':
      return isArtist ? 'Watch the vote. You cannot pick your own drawing.' : 'Pick the real prompt. Avoid your own fake.';
    case 'results':
      return 'See who got fooled — next drawing is coming.';
    case 'finalScores':
      return 'Cheer the podium. The TV can start another game.';
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export type PodiumTitle = {
  playerId: string;
  title: string;
};

export function podiumTitles(scores: ScoreEntry[]): PodiumTitle[] {
  if (scores.length === 0) {
    return [];
  }
  const titles: PodiumTitle[] = [];
  const champion = scores[0];
  if (champion) {
    titles.push({ playerId: champion.playerId, title: 'Champion' });
  }
  if (scores[1]) {
    titles.push({ playerId: scores[1].playerId, title: 'Runner-up' });
  }
  if (scores[2]) {
    titles.push({ playerId: scores[2].playerId, title: 'Crowd Favorite' });
  }
  const underdog = [...scores].sort((a, b) => a.score - b.score)[0];
  if (underdog && underdog.playerId !== champion?.playerId && scores.length > 3) {
    titles.push({ playerId: underdog.playerId, title: 'Dark Horse' });
  }
  return titles;
}
