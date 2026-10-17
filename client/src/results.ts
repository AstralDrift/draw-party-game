import type { RoundResult, ScoreEntry } from './protocol';
import { competitionRank } from './polish';

export function revealStandings(result: RoundResult, scores?: ScoreEntry[], playerIds?: string[]) {
  const deltas = new Map(result.scoreDeltas.map((delta) => [delta.playerId, delta]));
  const after = scores ?? result.scoreDeltas.map((delta) => ({
    playerId: delta.playerId, name: delta.name, score: delta.scoreAfter ?? delta.delta
  }));
  const before = after.map((score) => ({
    ...score, score: score.score - (deltas.get(score.playerId)?.delta ?? 0)
  }));
  // A dead heat before this beat (e.g. everyone at 0 after round one) has no
  // ranking to move from, so nobody should show up or down arrows yet.
  const priorTie = before.every((score) => score.score === before[0]?.score);
  const visibleIds = playerIds ? new Set(playerIds) : null;
  return after.filter((score) => !visibleIds || visibleIds.has(score.playerId)).map((score) => {
    const rank = competitionRank(after, score);
    const prior = before.find((candidate) => candidate.playerId === score.playerId)!;
    return {
      ...score,
      delta: deltas.get(score.playerId)?.delta ?? 0,
      rank,
      movement: priorTie ? 0 : competitionRank(before, prior) - rank
    };
  }).sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));
}
