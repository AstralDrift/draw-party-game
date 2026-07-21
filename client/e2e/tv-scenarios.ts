import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createPlayers, drawStroke, makeAppUrl, startParty } from './helpers';
import { TV_REVIEW_VIEWPORTS, TV_VIEWPORTS, type TvViewport } from './tv-layout';

export type TvDisplaySession = {
  context: BrowserContext;
  page: Page;
};

export type OpenTvDisplay = (
  browser: Browser,
  viewport: Pick<TvViewport, 'width' | 'height'>,
  appUrl: (path: string) => string
) => Promise<TvDisplaySession>;

export type TvPhaseAssert = (args: {
  page: Page;
  viewport: TvViewport;
  shotName: string;
}) => Promise<void>;

/** Plain Chromium living-room viewport (geometric layout gate). */
export async function openPlainTvDisplay(
  browser: Browser,
  viewport: Pick<TvViewport, 'width' | 'height'>,
  appUrl: (path: string) => string
): Promise<TvDisplaySession> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }
  });
  const page = await context.newPage();
  await page.goto(appUrl('/'));
  await expect(page.locator('.room-code')).toHaveText(/[A-Z]{4}/);
  return { context, page };
}

export async function runEmptyLobbyScenario(opts: {
  browser: Browser;
  baseURL: string | undefined;
  openDisplay: OpenTvDisplay;
  assert: TvPhaseAssert;
}): Promise<void> {
  const appUrl = makeAppUrl(opts.baseURL);
  for (const viewport of TV_VIEWPORTS) {
    const { context, page } = await opts.openDisplay(opts.browser, viewport, appUrl);
    try {
      await opts.assert({ page, viewport, shotName: `${viewport.name}-empty-lobby.png` });
    } finally {
      await context.close();
    }
  }
}

export async function runPopulatedLobbyScenario(opts: {
  browser: Browser;
  baseURL: string | undefined;
  openDisplay: OpenTvDisplay;
  assert: TvPhaseAssert;
}): Promise<void> {
  const appUrl = makeAppUrl(opts.baseURL);
  for (const viewport of TV_REVIEW_VIEWPORTS) {
    const contexts: BrowserContext[] = [];
    try {
      const { context, page: tv } = await opts.openDisplay(opts.browser, viewport, appUrl);
      contexts.push(context);
      const roomCode = (await tv.locator('.room-code').innerText()).trim();
      await createPlayers(opts.browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy']);
      await expect(tv.getByRole('button', { name: 'Start from TV (fallback)' })).toBeEnabled();
      await opts.assert({ page: tv, viewport, shotName: `${viewport.name}-populated-lobby.png` });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
}

export async function runDrawingGuessingScenario(opts: {
  browser: Browser;
  baseURL: string | undefined;
  openDisplay: OpenTvDisplay;
  assertDrawing: TvPhaseAssert;
  assertGuessing: TvPhaseAssert;
}): Promise<void> {
  const appUrl = makeAppUrl(opts.baseURL);
  for (const viewport of TV_REVIEW_VIEWPORTS) {
    const contexts: BrowserContext[] = [];
    try {
      const { context, page: tv } = await opts.openDisplay(opts.browser, viewport, appUrl);
      contexts.push(context);
      const roomCode = (await tv.locator('.room-code').innerText()).trim();

      const players = await createPlayers(opts.browser, contexts, appUrl, roomCode, ['FitA', 'FitB', 'FitC']);
      await startParty(players[0]);

      for (const player of players) {
        await expect(player.locator('canvas.draw-canvas')).toBeVisible({ timeout: 15_000 });
      }
      await expect(tv.locator('.progress-panel')).toBeVisible();
      await opts.assertDrawing({ page: tv, viewport, shotName: `${viewport.name}-drawing.png` });

      for (const player of players) {
        await drawStroke(player);
        await expect(player.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
        await player.getByRole('button', { name: 'Submit Drawing' }).click();
      }

      await expect(tv.getByText('What did they draw?')).toBeVisible({ timeout: 20_000 });
      await opts.assertGuessing({ page: tv, viewport, shotName: `${viewport.name}-guessing.png` });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
}
