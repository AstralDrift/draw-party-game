import type { RoundResult, ScoreEntry } from './protocol';

type RoundOutcomeInput = Pick<RoundResult, 'breakdown' | 'correctVoterNames'>;

export type RoundHighlightTone = 'truth' | 'fake' | 'score';

export interface RoundHighlightCard {
  label: string;
  title: string;
  detail: string;
  tone: RoundHighlightTone;
}

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

export function roundHighlightCards(result: RoundResult): RoundHighlightCard[] {
  const highlights: RoundHighlightCard[] = [];
  const totalVoters = new Set(result.breakdown.flatMap((item) => item.voterNames)).size;

  if (result.correctVoterNames.length === 0) {
    highlights.push({
      label: 'Table stumper',
      title: 'Nobody found the real prompt',
      detail: 'The room got completely fooled.',
      tone: 'truth'
    });
  } else if (totalVoters > 0 && result.correctVoterNames.length === totalVoters) {
    highlights.push({
      label: 'Clean sweep',
      title: 'Everyone found it',
      detail: 'The fakes did not stand a chance.',
      tone: 'truth'
    });
  } else {
    highlights.push({
      label: 'Truth squad',
      title: formatNameList(result.correctVoterNames),
      detail: 'Found the real prompt.',
      tone: 'truth'
    });
  }

  const bestFake = result.breakdown
    .filter((item) => !item.isCorrect && item.voterNames.length > 0)
    .sort((a, b) => b.voterNames.length - a.voterNames.length)[0];
  if (bestFake) {
    const voteCount = bestFake.voterNames.length;
    highlights.push({
      label: 'Best fake',
      title: bestFake.authorName ? `${bestFake.authorName}'s bluff` : 'Mystery bluff',
      detail: `“${bestFake.optionText}” pulled ${voteCount} ${voteCount === 1 ? 'vote' : 'votes'}.`,
      tone: 'fake'
    });
  }

  const positiveDeltas = result.scoreDeltas.filter((delta) => delta.delta > 0);
  const biggestDelta = Math.max(0, ...positiveDeltas.map((delta) => delta.delta));
  const topDeltas = positiveDeltas.filter((delta) => delta.delta === biggestDelta);
  if (biggestDelta > 0 && topDeltas.length > 0) {
    highlights.push({
      label: 'Biggest jump',
      title: topDeltas.length === 1 ? `${topDeltas[0].name} +${biggestDelta}` : `${topDeltas.length} players +${biggestDelta}`,
      detail:
        topDeltas.length === 1
          ? 'Largest score gain this reveal.'
          : `${formatNameList(topDeltas.map((delta) => delta.name))} had the largest score gain this reveal.`,
      tone: 'score'
    });
  }

  return highlights;
}

function formatNameList(names: string[]): string {
  if (names.length === 0) {
    return 'No one';
  }
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}
