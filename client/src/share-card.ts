import { finalWinnerText, podiumTitles } from './polish';
import type { ScoreEntry } from './protocol';

export async function exportShareCard(scores: ScoreEntry[]): Promise<'ok' | 'failed'> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return 'failed';
    }
    ctx.fillStyle = '#10131f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff6d7';
    ctx.font = 'bold 72px sans-serif';
    ctx.fillText('Draw Party', 64, 120);
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(finalWinnerText(scores), 64, 220);

    const titles = new Map(podiumTitles(scores).map((entry) => [entry.playerId, entry.title]));
    const rows = scores.slice(0, 8).map((score, index) => {
      const title = titles.get(score.playerId);
      const rank = index < 3 ? ['1st', '2nd', '3rd'][index] : `${index + 1}.`;
      return `${rank} ${score.name}${title ? ` · ${title}` : ''} ${score.score} pts`;
    });
    ctx.font = '36px sans-serif';
    rows.forEach((row, index) => {
      ctx.fillText(row, 64, 320 + index * 56);
    });

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'draw-party-podium.png';
    link.click();
    return 'ok';
  } catch {
    return 'failed';
  }
}
