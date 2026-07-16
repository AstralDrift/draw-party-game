import { button, el } from './dom';
import { finalWinnerText, podiumTitles } from './polish';
import type { Role, ScoreEntry } from './protocol';
import { exportShareCard } from './share-card';

export function renderScoresPanel(options: {
  scores: ScoreEntry[];
  podium: boolean;
  role: Role;
  onShareFailed: () => void;
  renderConfetti: (variant: 'result' | 'final') => HTMLElement;
}): HTMLElement {
  const { scores, podium, role } = options;
  const topScores = podium ? scores.slice(0, 3) : [];
  const winner = scores[0];
  const listedScores = podium && role === 'player' ? scores.slice(3) : scores;
  const rankOffset = podium && role === 'player' ? 3 : 0;
  const titles = new Map(podiumTitles(scores).map((entry) => [entry.playerId, entry.title]));
  const list = el('div', { class: 'score-list' });
  for (const [index, score] of listedScores.entries()) {
    const title = titles.get(score.playerId);
    list.appendChild(
      el(
        'div',
        { class: `score-row ${rankOffset + index === 0 ? 'winner' : ''}` },
        el('span', {}, `${rankOffset + index + 1}. ${score.name}${title ? ` · ${title}` : ''}`),
        el('span', { class: 'pill' }, `${score.score} pts`)
      )
    );
  }
  return el(
    'section',
    { class: 'panel scores-panel', id: 'scores-panel' },
    podium ? options.renderConfetti('final') : null,
    podium
      ? el(
          'div',
          { class: 'winner-callout' },
          role === 'player' ? el('p', { class: 'eyebrow' }, 'Champion') : null,
          el('h2', {}, finalWinnerText(scores)),
          role === 'player' && winner ? el('span', { class: 'pill' }, `${winner.score} pts`) : null
        )
      : null,
    el('div', { class: 'panel-title' }, podium ? 'Final Podium' : 'Scores'),
    podium
      ? el(
          'div',
          { class: 'podium' },
          ...topScores.map((score, index) =>
            el(
              'div',
              { class: `podium-place place-${index + 1}` },
              el('span', { class: 'podium-rank' }, podiumRank(index)),
              el('strong', {}, score.name),
              el('span', { class: 'podium-title' }, titles.get(score.playerId) ?? ''),
              el('span', {}, `${score.score} pts`)
            )
          )
        )
      : null,
    listedScores.length > 0 ? list : null,
    podium && role === 'display'
      ? button('Share Podium Card', 'tool-button wide share-card-button', () => {
          void exportShareCard(scores).then((result) => {
            if (result === 'failed') {
              options.onShareFailed();
            }
          });
        })
      : null
  );
}

function podiumRank(index: number): string {
  return ['1st', '2nd', '3rd'][index] ?? `${index + 1}th`;
}
