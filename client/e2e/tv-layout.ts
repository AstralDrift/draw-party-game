import { expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type TvViewport = {
  name: string;
  width: number;
  height: number;
};

/** Living-room TV Bro / smart-TV CSS viewports we gate before production. */
export const TV_VIEWPORTS: TvViewport[] = [
  { name: 'tvbro-720p', width: 1280, height: 720 },
  { name: 'tvbro-768p', width: 1366, height: 768 },
  { name: 'full-hd-tv', width: 1920, height: 1080 },
  { name: 'qhd-tv', width: 2560, height: 1440 },
  { name: 'uhd-4k-tv', width: 3840, height: 2160 }
];

/** Subset used for heavier mid-game layout checks. */
export const TV_REVIEW_VIEWPORTS: TvViewport[] = [
  { name: 'tvbro-720p', width: 1280, height: 720 },
  { name: 'full-hd-tv', width: 1920, height: 1080 },
  { name: 'uhd-4k-tv', width: 3840, height: 2160 }
];

export type Box = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
  x: number;
  y: number;
};

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TV_REVIEW_DIR = join(clientDir, 'artifacts', 'tv-review');

export function boxesOverlap(a: Box, b: Box, slack = 1): boolean {
  return !(
    a.bottom <= b.top + slack ||
    b.bottom <= a.top + slack ||
    a.right <= b.left + slack ||
    b.right <= a.left + slack
  );
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => Math.ceil(document.documentElement.scrollWidth) <= Math.ceil(window.innerWidth) + 1)
    )
    .toBe(true);
}

export async function expectNoVerticalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => Math.ceil(document.documentElement.scrollHeight) <= Math.ceil(window.innerHeight) + 4)
    )
    .toBe(true);
}

export type LobbyLayoutMetrics = {
  emptyState: Box | null;
  hero: Box;
  heroLineCount: number;
  manualJoin: Box;
  playerRows: Box[];
  playersCount: Box;
  qr: Box;
  roomCode: Box;
  roomPanel: Box;
  start: Box;
};

export async function readLobbyLayout(page: Page): Promise<LobbyLayoutMetrics> {
  return page.evaluate(() => {
    const rect = (selector: string): Box => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing ${selector}`);
      }
      return element.getBoundingClientRect().toJSON();
    };
    const optionalRect = (selector: string): Box | null => {
      const element = document.querySelector(selector);
      return element ? element.getBoundingClientRect().toJSON() : null;
    };
    return {
      emptyState: optionalRect('.players-panel .empty-state'),
      hero: rect('.room-hero-copy h2'),
      heroLineCount: (() => {
        const heading = document.querySelector('.room-hero-copy h2');
        if (!heading) throw new Error('Missing lobby heading');
        const range = document.createRange();
        range.selectNodeContents(heading);
        return range.getClientRects().length;
      })(),
      manualJoin: rect('.manual-join'),
      playerRows: Array.from(document.querySelectorAll('.players-panel .player-row')).map((row) =>
        row.getBoundingClientRect().toJSON()
      ),
      playersCount: rect('.players-panel .players-count'),
      qr: rect('.qr'),
      roomCode: rect('.room-code'),
      roomPanel: rect('.room-panel'),
      start: rect('.start-button')
    };
  });
}

/** Geometric invariants that failed on 4K TV Bro (clipped hero, stacked player copy). */
export async function assertDisplayLobbyLayout(
  page: Page,
  viewport: Pick<TvViewport, 'width' | 'height'>
): Promise<LobbyLayoutMetrics> {
  await expect(page.locator('.room-code')).toHaveText(/[A-Z]{4}/);
  await expect(page.locator('.qr')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start from TV (fallback)' })).toBeVisible();
  await expect(page.getByText('Everybody draws. Everybody guesses.')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoVerticalOverflow(page);

  const metrics = await readLobbyLayout(page);
  expect(metrics.qr.bottom).toBeLessThanOrEqual(viewport.height + 4);
  expect(metrics.start.bottom).toBeLessThanOrEqual(viewport.height + 4);
  expect(metrics.start.width).toBeGreaterThanOrEqual(52);
  expect(metrics.start.height).toBeGreaterThanOrEqual(52);
  expect(metrics.roomCode.height).toBeLessThan(viewport.height * 0.18);
  expect(metrics.qr.width).toBeGreaterThanOrEqual(viewport.width >= 1800 ? 250 : 180);

  // Hero must stay inside the room panel (no top-edge clip).
  expect(metrics.hero.top).toBeGreaterThanOrEqual(metrics.roomPanel.top + 4);
  expect(metrics.hero.bottom).toBeLessThanOrEqual(metrics.roomCode.top + 2);
  if (viewport.width <= 1366) {
    expect(metrics.heroLineCount).toBeLessThanOrEqual(2);
  }

  // Manual joining stays legible without squeezing the hero or colliding with the QR/CTA.
  expect(boxesOverlap(metrics.manualJoin, metrics.qr)).toBe(false);
  expect(metrics.manualJoin.bottom).toBeLessThanOrEqual(metrics.start.top + 2);

  // Players meta must stack cleanly — never paint on the same box.
  if (metrics.emptyState) {
    expect(metrics.playersCount.bottom).toBeLessThanOrEqual(metrics.emptyState.top + 2);
    expect(metrics.emptyState.top - metrics.playersCount.top).toBeGreaterThan(10);
    expect(boxesOverlap(metrics.playersCount, metrics.emptyState)).toBe(false);
  } else {
    expect(metrics.playerRows.length).toBeGreaterThan(0);
    expect(metrics.playersCount.bottom).toBeLessThanOrEqual(metrics.playerRows[0].top + 2);
    for (let index = 0; index < metrics.playerRows.length; index += 1) {
      const row = metrics.playerRows[index];
      expect(boxesOverlap(metrics.playersCount, row)).toBe(false);
      if (index > 0) {
        const previous = metrics.playerRows[index - 1];
        expect(boxesOverlap(previous, row)).toBe(false);
        expect(row.top).toBeGreaterThanOrEqual(previous.top - 1);
        if (row.top > previous.top + 1) {
          expect(row.top).toBeGreaterThanOrEqual(previous.bottom - 1);
        }
      }
    }
  }

  if (viewport.width >= 3840 && metrics.playerRows.length > 0) {
    const typeSizes = await page.evaluate(() => {
      const sizes = (selector: string) =>
        Array.from(document.querySelectorAll(selector)).map((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize)
        );
      return {
        names: sizes('.player-name'),
        meta: sizes('.player-meta, .player-status, .player-score'),
        settings: sizes('.settings-summary strong'),
        tertiary: sizes(
          '.display .connection, .display .eyebrow, .display .room-code-label, .display .room-hero-sub, .display .panel-subtitle, .display .field-label, .display .start-note, .display .empty-state, .display .host-badge'
        )
      };
    });
    expect(typeSizes.names.length).toBeGreaterThan(0);
    expect(typeSizes.meta.length).toBeGreaterThan(0);
    expect(typeSizes.settings.length).toBeGreaterThan(0);
    expect(typeSizes.tertiary.length).toBeGreaterThan(0);
    expect(typeSizes.names.every((size) => size >= 24)).toBe(true);
    expect(typeSizes.meta.every((size) => size >= 18)).toBe(true);
    expect(typeSizes.settings.every((size) => size >= 24)).toBe(true);
    expect(typeSizes.tertiary.every((size) => size >= 18), JSON.stringify(typeSizes.tertiary)).toBe(true);
  }

  return metrics;
}

export async function assertDisplayPhaseFits(page: Page, viewport: Pick<TvViewport, 'width' | 'height'>): Promise<void> {
  await expectNoHorizontalOverflow(page);
  await expectNoVerticalOverflow(page);
  const shellBottom = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell.display');
    if (!shell) {
      throw new Error('Missing display shell');
    }
    return shell.getBoundingClientRect().bottom;
  });
  expect(shellBottom).toBeLessThanOrEqual(viewport.height + 4);
}

export function shouldWriteTvReviewGallery(): boolean {
  return process.env.TV_REVIEW === '1' || process.env.CI === 'true';
}

export async function writeTvReviewShot(page: Page, filename: string): Promise<string | null> {
  if (!shouldWriteTvReviewGallery()) {
    return null;
  }
  await mkdir(TV_REVIEW_DIR, { recursive: true });
  const path = join(TV_REVIEW_DIR, filename);
  await page.screenshot({ path, fullPage: false });
  return path;
}

export async function writeTvReviewIndex(entries: Array<{ title: string; file: string }>): Promise<void> {
  if (!shouldWriteTvReviewGallery() || entries.length === 0) {
    return;
  }
  await mkdir(TV_REVIEW_DIR, { recursive: true });
  const cards = entries
    .map(
      (entry) => `    <figure>
      <figcaption>${escapeHtml(entry.title)}</figcaption>
      <img src="./${escapeHtml(entry.file)}" alt="${escapeHtml(entry.title)}" />
    </figure>`
    )
    .join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Draw Party TV review</title>
  <style>
    :root { color-scheme: dark; font-family: "DM Sans", system-ui, sans-serif; }
    body { margin: 0; padding: 24px; background: #05060a; color: #f5f5f7; }
    h1 { margin: 0 0 8px; font-size: 1.5rem; }
    p { margin: 0 0 24px; color: #a1a1a6; }
    main { display: grid; gap: 24px; }
    figure { margin: 0; border: 1px solid rgba(255,255,255,0.16); border-radius: 16px; overflow: hidden; background: #0c0e16; }
    figcaption { padding: 12px 16px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.08); }
    img { display: block; width: 100%; height: auto; background: #000; }
  </style>
</head>
<body>
  <h1>Draw Party TV layout review</h1>
  <p>Glance these shots before shipping living-room UI. CI also asserts geometry (clip/overlap) and WebView-shaped pixel baselines.</p>
  <main>
${cards}
  </main>
</body>
</html>
`;
  await writeFile(join(TV_REVIEW_DIR, 'index.html'), html, 'utf8');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
