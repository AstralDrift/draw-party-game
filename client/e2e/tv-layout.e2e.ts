import { expect, test, type TestInfo } from '@playwright/test';
import {
  openPlainTvDisplay,
  runDrawingGuessingScenario,
  runEmptyLobbyScenario,
  runPopulatedLobbyScenario
} from './tv-scenarios';
import {
  assertDisplayLobbyLayout,
  assertDisplayPhaseFits,
  writeTvReviewIndex,
  writeTvReviewShot
} from './tv-layout';

const reviewEntries: Array<{ title: string; file: string }> = [];

test.afterAll(async () => {
  await writeTvReviewIndex(reviewEntries);
});

async function captureLayoutShot(
  page: Parameters<typeof writeTvReviewShot>[0],
  shotName: string,
  title: string,
  testInfo: TestInfo
): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(shotName), fullPage: false });
  if (await writeTvReviewShot(page, shotName)) {
    reviewEntries.push({ title, file: shotName });
  }
}

test('TV layout gate: empty lobby stays readable from 720p through 4K', async ({
  baseURL,
  browser
}, testInfo) => {
  await runEmptyLobbyScenario({
    browser,
    baseURL,
    openDisplay: openPlainTvDisplay,
    assert: async ({ page, viewport, shotName }) => {
      await assertDisplayLobbyLayout(page, viewport);
      await captureLayoutShot(page, shotName, `${viewport.name} · empty lobby`, testInfo);
    }
  });
});

test('TV layout gate: populated lobby keeps roster rows stacked', async ({
  baseURL,
  browser
}, testInfo) => {
  await runPopulatedLobbyScenario({
    browser,
    baseURL,
    openDisplay: openPlainTvDisplay,
    assert: async ({ page, viewport, shotName }) => {
      await assertDisplayLobbyLayout(page, viewport);
      await captureLayoutShot(page, shotName, `${viewport.name} · populated lobby`, testInfo);
    }
  });
});

test('TV layout gate: drawing and guessing phases fit key living-room sizes', async ({
  baseURL,
  browser
}, testInfo) => {
  await runDrawingGuessingScenario({
    browser,
    baseURL,
    openDisplay: openPlainTvDisplay,
    assertDrawing: async ({ page, viewport, shotName }) => {
      await assertDisplayPhaseFits(page, viewport);
      await captureLayoutShot(page, shotName, `${viewport.name} · drawing`, testInfo);
    },
    assertGuessing: async ({ page, viewport, shotName }) => {
      await assertDisplayPhaseFits(page, viewport);
      const revealBottom = await page.evaluate(() => {
        const canvas = document.querySelector('.reveal-canvas');
        if (!canvas) {
          throw new Error('Missing reveal canvas');
        }
        return canvas.getBoundingClientRect().bottom;
      });
      expect(revealBottom).toBeLessThanOrEqual(viewport.height + 4);
      await captureLayoutShot(page, shotName, `${viewport.name} · guessing`, testInfo);
    }
  });
});
