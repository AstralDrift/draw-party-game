import { expect, test, type BrowserContext } from '@playwright/test';
import { createPlayers, drawStroke, makeAppUrl } from './helpers';
import {
  assertDisplayLobbyLayout,
  assertDisplayPhaseFits,
  TV_REVIEW_VIEWPORTS,
  TV_VIEWPORTS,
  writeTvReviewIndex,
  writeTvReviewShot,
  type TvViewport
} from './tv-layout';

const reviewEntries: Array<{ title: string; file: string }> = [];

test.afterAll(async () => {
  await writeTvReviewIndex(reviewEntries);
});

test('TV layout gate: empty lobby stays readable from 720p through 4K', async ({ baseURL, browser }, testInfo) => {
  const appUrl = makeAppUrl(baseURL);

  for (const target of TV_VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: target.width, height: target.height } });
    try {
      const page = await context.newPage();
      await page.goto(appUrl('/'));
      await assertDisplayLobbyLayout(page, target);

      const shotName = `${target.name}-empty-lobby.png`;
      await page.screenshot({ path: testInfo.outputPath(shotName), fullPage: false });
      const reviewPath = await writeTvReviewShot(page, shotName);
      if (reviewPath) {
        reviewEntries.push({ title: `${target.name} · empty lobby`, file: shotName });
      }
    } finally {
      await context.close();
    }
  }
});

test('TV layout gate: populated lobby keeps roster rows stacked', async ({ baseURL, browser }, testInfo) => {
  const appUrl = makeAppUrl(baseURL);
  const targets: TvViewport[] = TV_REVIEW_VIEWPORTS;

  for (const target of targets) {
    const contexts: BrowserContext[] = [];
    try {
      const tvContext = await browser.newContext({ viewport: { width: target.width, height: target.height } });
      contexts.push(tvContext);
      const tv = await tvContext.newPage();
      await tv.goto(appUrl('/'));
      await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
      const roomCode = (await tv.locator('.room-code').innerText()).trim();

      await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy']);
      await expect(tv.getByRole('button', { name: 'Start Game' })).toBeEnabled();
      await assertDisplayLobbyLayout(tv, target);

      const shotName = `${target.name}-populated-lobby.png`;
      await tv.screenshot({ path: testInfo.outputPath(shotName), fullPage: false });
      const reviewPath = await writeTvReviewShot(tv, shotName);
      if (reviewPath) {
        reviewEntries.push({ title: `${target.name} · populated lobby`, file: shotName });
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
});

test('TV layout gate: drawing and guessing phases fit key living-room sizes', async ({ baseURL, browser }, testInfo) => {
  const appUrl = makeAppUrl(baseURL);

  for (const target of TV_REVIEW_VIEWPORTS) {
    const contexts: BrowserContext[] = [];
    try {
      const tvContext = await browser.newContext({ viewport: { width: target.width, height: target.height } });
      contexts.push(tvContext);
      const tv = await tvContext.newPage();
      await tv.goto(appUrl('/'));
      await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
      const roomCode = (await tv.locator('.room-code').innerText()).trim();

      const players = await createPlayers(browser, contexts, appUrl, roomCode, ['FitA', 'FitB']);
      await tv.getByRole('button', { name: 'Start Game' }).click();

      for (const player of players) {
        await expect(player.locator('canvas.draw-canvas')).toBeVisible({ timeout: 15_000 });
      }
      await assertDisplayPhaseFits(tv, target);
      await expect(tv.locator('.progress-panel')).toBeVisible();

      const drawingShot = `${target.name}-drawing.png`;
      await tv.screenshot({ path: testInfo.outputPath(drawingShot), fullPage: false });
      if (await writeTvReviewShot(tv, drawingShot)) {
        reviewEntries.push({ title: `${target.name} · drawing`, file: drawingShot });
      }

      for (const player of players) {
        await drawStroke(player);
        await expect(player.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
        await player.getByRole('button', { name: 'Submit Drawing' }).click();
      }

      await expect(tv.getByText('What did they draw?')).toBeVisible({ timeout: 20_000 });
      await assertDisplayPhaseFits(tv, target);
      const revealBottom = await tv.evaluate(() => {
        const canvas = document.querySelector('.reveal-canvas');
        if (!canvas) {
          throw new Error('Missing reveal canvas');
        }
        return canvas.getBoundingClientRect().bottom;
      });
      expect(revealBottom).toBeLessThanOrEqual(target.height + 4);

      const guessingShot = `${target.name}-guessing.png`;
      await tv.screenshot({ path: testInfo.outputPath(guessingShot), fullPage: false });
      if (await writeTvReviewShot(tv, guessingShot)) {
        reviewEntries.push({ title: `${target.name} · guessing`, file: guessingShot });
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
});
