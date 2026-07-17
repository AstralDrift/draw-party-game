import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { createPlayers, drawStroke, makeAppUrl } from './helpers';
import {
  openTvBroDisplay,
  TV_BRO_SCREENSHOT_OPTIONS,
  tvBroScreenshotMasks
} from './tv-bro-profile';
import {
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

async function assertTvBroScreenshot(page: Page, name: string, testInfo: TestInfo): Promise<void> {
  const masks = await tvBroScreenshotMasks(page);
  await expect(page).toHaveScreenshot(name, {
    ...TV_BRO_SCREENSHOT_OPTIONS,
    mask: masks
  });

  const reviewPath = await writeTvReviewShot(page, name);
  if (reviewPath) {
    reviewEntries.push({ title: name.replace(/\.png$/, ''), file: name });
  }
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: false });
}

test('TV Bro pixel preview: empty lobby matches WebView-shaped baselines', async ({
  baseURL,
  browser
}, testInfo) => {
  test.setTimeout(180_000);
  const appUrl = makeAppUrl(baseURL);

  for (const target of TV_VIEWPORTS) {
    const { context, page } = await openTvBroDisplay(browser, target, appUrl);
    try {
      await assertTvBroScreenshot(page, `${target.name}-empty-lobby.png`, testInfo);
    } finally {
      await context.close();
    }
  }
});

test('TV Bro pixel preview: populated lobby matches WebView-shaped baselines', async ({
  baseURL,
  browser
}, testInfo) => {
  test.setTimeout(180_000);
  const appUrl = makeAppUrl(baseURL);
  const targets: TvViewport[] = TV_REVIEW_VIEWPORTS;

  for (const target of targets) {
    const contexts: BrowserContext[] = [];
    try {
      const { context, page: tv } = await openTvBroDisplay(browser, target, appUrl);
      contexts.push(context);
      const roomCode = (await tv.locator('.room-code').innerText()).trim();

      await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy']);
      await expect(tv.getByRole('button', { name: 'Start Game' })).toBeEnabled();
      await assertTvBroScreenshot(tv, `${target.name}-populated-lobby.png`, testInfo);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
});

test('TV Bro pixel preview: drawing and guessing match WebView-shaped baselines', async ({
  baseURL,
  browser
}, testInfo) => {
  test.setTimeout(240_000);
  const appUrl = makeAppUrl(baseURL);

  for (const target of TV_REVIEW_VIEWPORTS) {
    const contexts: BrowserContext[] = [];
    try {
      const { context, page: tv } = await openTvBroDisplay(browser, target, appUrl);
      contexts.push(context);
      const roomCode = (await tv.locator('.room-code').innerText()).trim();

      const players = await createPlayers(browser, contexts, appUrl, roomCode, ['FitA', 'FitB']);
      await tv.getByRole('button', { name: 'Start Game' }).click();

      for (const player of players) {
        await expect(player.locator('canvas.draw-canvas')).toBeVisible({ timeout: 15_000 });
      }
      await expect(tv.locator('.progress-panel')).toBeVisible();
      await assertTvBroScreenshot(tv, `${target.name}-drawing.png`, testInfo);

      for (const player of players) {
        await drawStroke(player);
        await expect(player.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
        await player.getByRole('button', { name: 'Submit Drawing' }).click();
      }

      await expect(tv.getByText('What did they draw?')).toBeVisible({ timeout: 20_000 });
      await expect(tv.locator('.reveal-canvas')).toBeVisible();
      await assertTvBroScreenshot(tv, `${target.name}-guessing.png`, testInfo);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
});
