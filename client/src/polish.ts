import type { GamePhase, RoundResult, ScoreEntry } from './protocol';

/** Soft party-size guidance. Server `MIN_PLAYERS` stays 1 for solo/demo. */
export const RECOMMENDED_PARTY_SIZE = 3;

type RoundOutcomeInput = Pick<
  RoundResult,
  'breakdown' | 'correctVoterNames' | 'nobodyFoundIt' | 'perfectTruth'
>;

export function displayLobbyStartNote(connectedCount: number, minPlayers: number): string {
  if (connectedCount < minPlayers) {
    if (connectedCount === 0) {
      return `Scan the QR (or type the code). Need ${minPlayers}+ phones.`;
    }
    const needed = Math.max(0, minPlayers - connectedCount);
    return `Need ${needed} more phone${needed === 1 ? '' : 's'} before kickoff.`;
  }
  if (connectedCount < RECOMMENDED_PARTY_SIZE) {
    return `${connectedCount} ready — playable now, best with 3+ for votes and fakes.`;
  }
  return `${connectedCount} ready — hit Start when the couch is full.`;
}

export function playerLobbyReadyNote(connectedCount: number, minPlayers: number): string {
  const needed = Math.max(0, minPlayers - connectedCount);
  if (needed > 0) {
    return `Need ${needed} more ${needed === 1 ? 'player' : 'players'}.`;
  }
  if (connectedCount < RECOMMENDED_PARTY_SIZE) {
    const invite = RECOMMENDED_PARTY_SIZE - connectedCount;
    return `Invite ${invite} more for better voting.`;
  }
  return 'The TV can start the game.';
}

export function roundOutcomeText(result: RoundOutcomeInput): string {
  if (result.nobodyFoundIt) {
    return 'Nobody got it — artist wins the room';
  }
  if (result.perfectTruth) {
    return 'Everyone saw through it — perfect!';
  }

  const correctVoters = result.correctVoterNames;
  if (correctVoters.length === 1) {
    return `${correctVoters[0]} cracked it`;
  }
  if (correctVoters.length === 2) {
    return `${correctVoters[0]} and ${correctVoters[1]} cracked it`;
  }
  if (correctVoters.length > 2) {
    return `${correctVoters.length} players cracked it`;
  }
  return 'Nobody got it — artist wins the room';
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
      return 'You’re in. Watch the TV — the host starts when the room feels ready.';
    case 'drawing':
      return 'Draw fast and messy. Clarity is optional. Comedy is not.';
    case 'guessing':
      return isArtist
        ? 'Your drawing is on the TV. Enjoy the fake titles rolling in.'
        : 'Invent a title that sounds real. Fooling people is the whole game.';
    case 'voting':
      return isArtist
        ? 'Sit back. You can’t vote on your own masterpiece.'
        : 'Hunt the real prompt. Skip your own fake — that’s the trap.';
    case 'results':
      return 'Watch who got cooked. Next drawing is loading.';
    case 'finalScores':
      return 'Cheer the podium. Yell for one more round.';
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
