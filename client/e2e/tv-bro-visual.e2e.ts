import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { openTvBroDisplay, tvBroScreenshotMasks } from './tv-bro-profile';
import {
  runDrawingGuessingScenario,
  runEmptyLobbyScenario,
  runPopulatedLobbyScenario
} from './tv-scenarios';
import { writeTvReviewIndex, writeTvReviewShot } from './tv-layout';

const reviewEntries: Array<{ title: string; file: string }> = [];
const screenshotStylePath = fileURLToPath(new URL('./tv-bro-screenshot.css', import.meta.url));

test.afterAll(async () => {
  await writeTvReviewIndex(reviewEntries);
});

async function assertPixelBaseline(
  page: Parameters<typeof writeTvReviewShot>[0],
  shotName: string
): Promise<void> {
  await expect(page).toHaveScreenshot(shotName, {
    mask: tvBroScreenshotMasks(page),
    stylePath: screenshotStylePath
  });
  if (await writeTvReviewShot(page, shotName)) {
    reviewEntries.push({ title: shotName.replace(/\.png$/, ''), file: shotName });
  }
}

test('TV Bro pixel preview: empty lobby matches WebView-shaped baselines', async ({
  baseURL,
  browser
}) => {
  test.setTimeout(180_000);
  await runEmptyLobbyScenario({
    browser,
    baseURL,
    openDisplay: openTvBroDisplay,
    assert: ({ page, shotName }) => assertPixelBaseline(page, shotName)
  });
});

test('TV Bro pixel preview: populated lobby matches WebView-shaped baselines', async ({
  baseURL,
  browser
}) => {
  test.setTimeout(180_000);
  await runPopulatedLobbyScenario({
    browser,
    baseURL,
    openDisplay: openTvBroDisplay,
    assert: ({ page, shotName }) => assertPixelBaseline(page, shotName)
  });
});

test('TV Bro pixel preview: drawing and guessing match WebView-shaped baselines', async ({
  baseURL,
  browser
}) => {
  test.setTimeout(240_000);
  await runDrawingGuessingScenario({
    browser,
    baseURL,
    openDisplay: openTvBroDisplay,
    assertDrawing: ({ page, shotName }) => assertPixelBaseline(page, shotName),
    assertGuessing: async ({ page, shotName }) => {
      await expect(page.locator('.reveal-canvas')).toBeVisible();
      await assertPixelBaseline(page, shotName);
    }
  });
});
