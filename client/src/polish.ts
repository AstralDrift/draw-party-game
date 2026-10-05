import type { GamePhase, RoundResult, ScoreEntry } from './protocol';

/** Party mode starts at three; the lobby offers a separate unscored solo Practice action. */
export const RECOMMENDED_PARTY_SIZE = 3;

type RoundOutcomeInput = Pick<
  RoundResult,
  'breakdown' | 'correctVoterNames' | 'nobodyFoundIt' | 'perfectTruth'
>;

export function displayLobbyStartNote(connectedCount: number, minPlayers: number): string {
  if (connectedCount < minPlayers) {
    if (connectedCount === 0) {
      return `Need ${minPlayers}+ phones.`;
    }
    const needed = Math.max(0, minPlayers - connectedCount);
    return `Need ${needed} more.`;
  }
  if (connectedCount < RECOMMENDED_PARTY_SIZE) {
    return `${connectedCount} ready — better with 3+.`;
  }
  return `${connectedCount} ready.`;
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
  return '';
}

export function roundOutcomeText(result: RoundOutcomeInput): string {
  const noVotes = result.breakdown.every((entry) => entry.voterNames.length === 0);
  if (noVotes && !result.nobodyFoundIt && !result.perfectTruth) {
    return 'No votes came in — no bonus awarded';
  }
  if (result.nobodyFoundIt) {
    return 'Nobody found the truth — artist +50';
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
  return 'Nobody found the truth — artist +50';
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

export function rematchPrompt(scores: ScoreEntry[]): string {
  if (scores.length <= 1) {
    return 'One more masterpiece?';
  }

  const topScore = scores[0]?.score;
  if (topScore === undefined) {
    return 'One more masterpiece?';
  }
  const winners = scores.filter((score) => score.score === topScore);
  if (winners.length === 2) {
    return `${winners[0].name} and ${winners[1].name} tied—settle it?`;
  }
  if (winners.length > 2) {
    return `${winners.length} players tied—settle it?`;
  }

  const runnerUp = scores.find((score) => score.score < topScore);
  if (!runnerUp || !winners[0]) {
    return 'Run it back?';
  }
  return `${winners[0].name} won by ${topScore - runnerUp.score}—take it back?`;
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

/** Competition ranking keeps equal scores level and leaves the next rank skipped: 1, 1, 3. */
export function competitionRank(scores: ScoreEntry[], score: ScoreEntry): number {
  return 1 + scores.filter((candidate) => candidate.score > score.score).length;
}

export function ordinalRank(rank: number): string {
  const mod100 = rank % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${rank}th`;
  }
  switch (rank % 10) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
}

export function podiumTitles(scores: ScoreEntry[]): PodiumTitle[] {
  if (scores.length === 0) {
    return [];
  }

  return scores.flatMap((score) => {
    const rank = competitionRank(scores, score);
    if (rank === 1) {
      return [{ playerId: score.playerId, title: 'Champion' }];
    }
    if (rank === 2) {
      return [{ playerId: score.playerId, title: 'Runner-up' }];
    }
    if (rank === 3) {
      return [{ playerId: score.playerId, title: 'Third Place' }];
    }
    return [];
  });
}
