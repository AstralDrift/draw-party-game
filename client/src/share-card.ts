import { finalWinnerText, podiumTitles } from './polish';
import type { ScoreEntry } from './protocol';

const BG_DEEP = '#05060a';
const GLOW_A = 'rgba(0, 113, 227, 0.28)';
const GLOW_B = 'rgba(120, 190, 255, 0.14)';
const SURFACE = 'rgba(255, 255, 255, 0.10)';
const BORDER = 'rgba(255, 255, 255, 0.16)';
const TEXT_PRIMARY = '#f5f5f7';
const TEXT_SECONDARY = '#a1a1a6';
const ACCENT = '#0071e3';
const WARNING = '#ffd60a';
const FONT_DISPLAY = '"Syne", "Segoe UI Display", "Avenir Next", sans-serif';
const FONT_BODY = '"DM Sans", "Segoe UI", "Helvetica Neue", sans-serif';

export type ShareCardResult = 'shared' | 'downloaded' | 'failed' | 'cancelled';

export function podiumShareLabel(): string {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      const probe = new File([new Uint8Array()], 'draw-party-podium.png', { type: 'image/png' });
      if (navigator.canShare({ files: [probe] })) {
        return 'Share Podium';
      }
    } catch {
      // Fall through to download label.
    }
  }
  return 'Download Podium';
}

export async function exportShareCard(scores: ScoreEntry[]): Promise<ShareCardResult> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return 'failed';
    }

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    drawShareCard(ctx, canvas.width, canvas.height, scores);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png');
    });
    if (!blob) {
      return 'failed';
    }

    const file = new File([blob], 'draw-party-podium.png', { type: 'image/png' });
    if (
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: 'Draw Party',
          text: finalWinnerText(scores)
        });
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return 'cancelled';
        }
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'draw-party-podium.png';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scores: ScoreEntry[]
): void {
  ctx.fillStyle = BG_DEEP;
  ctx.fillRect(0, 0, width, height);

  const glowA = ctx.createRadialGradient(220, 180, 20, 220, 180, 420);
  glowA.addColorStop(0, GLOW_A);
  glowA.addColorStop(1, 'rgba(0, 113, 227, 0)');
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, width, height);

  const glowB = ctx.createRadialGradient(860, 1100, 40, 860, 1100, 480);
  glowB.addColorStop(0, GLOW_B);
  glowB.addColorStop(1, 'rgba(120, 190, 255, 0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, width, height);

  roundRect(ctx, 56, 56, width - 112, height - 112, 36);
  ctx.fillStyle = SURFACE;
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = ACCENT;
  ctx.fillRect(88, 108, 72, 8);

  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = `700 72px ${FONT_DISPLAY}`;
  ctx.fillText('Draw Party', 88, 200);

  ctx.fillStyle = TEXT_SECONDARY;
  ctx.font = `600 28px ${FONT_BODY}`;
  ctx.fillText('FINAL PODIUM', 88, 260);

  ctx.fillStyle = TEXT_PRIMARY;
  ctx.font = `700 52px ${FONT_DISPLAY}`;
  const winnerLine = finalWinnerText(scores);
  wrapText(ctx, winnerLine, 88, 340, width - 176, 58);

  ctx.strokeStyle = BORDER;
  ctx.beginPath();
  ctx.moveTo(88, 430);
  ctx.lineTo(width - 88, 430);
  ctx.stroke();

  const titles = new Map(podiumTitles(scores).map((entry) => [entry.playerId, entry.title]));
  const rows = scores.slice(0, 8);
  rows.forEach((score, index) => {
    const y = 510 + index * 88;
    const rank = index < 3 ? ['1st', '2nd', '3rd'][index] : `${index + 1}.`;
    const title = titles.get(score.playerId);

    ctx.fillStyle = index === 0 ? ACCENT : TEXT_SECONDARY;
    ctx.font = `700 28px ${FONT_BODY}`;
    ctx.fillText(rank, 88, y);

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = `600 36px ${FONT_BODY}`;
    ctx.fillText(score.name, 180, y);

    if (title) {
      ctx.fillStyle = WARNING;
      ctx.font = `700 24px ${FONT_BODY}`;
      ctx.fillText(title, 180, y + 34);
    }

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = `700 32px ${FONT_BODY}`;
    const pts = `${score.score} pts`;
    const ptsWidth = ctx.measureText(pts).width;
    ctx.fillText(pts, width - 88 - ptsWidth, y);
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): void {
  const words = text.split(' ');
  let line = '';
  let cursorY = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) {
    ctx.fillText(line, x, cursorY);
  }
}
