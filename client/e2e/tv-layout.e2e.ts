import { expect, test, type BrowserContext, type TestInfo } from '@playwright/test';
import {
  assertAllWithinViewport,
  assertNoOverlaps,
  createPlayers,
  drawStroke,
  makeAppUrl,
  startParty,
  waitForGuessers
} from './helpers';
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

test('TV layout gate: eight-player long-answer results fit 720p, 768p, and 4K', async ({
  baseURL,
  browser
}) => {
  test.setTimeout(90_000);
  const appUrl = makeAppUrl(baseURL);
  const contexts: BrowserContext[] = [];
  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();
    const names = Array.from({ length: 8 }, (_, index) =>
      `P${String(index + 1).padStart(2, '0')}-${'N'.repeat(20)}`.slice(0, 24)
    );
    const players = await createPlayers(browser, contexts, appUrl, roomCode, names);
    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await Promise.all(
      players.slice(0, 5).map((player) => player.getByRole('button', { name: '😂' }).click())
    );
    for (const target of [tv, players[0]]) {
      await expect(target.locator('.reaction-layer')).toHaveCount(1);
      await expect(target.locator('.reaction-burst')).toHaveCount(5);
      const slots = await target.locator('.reaction-burst').evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-slot'))
      );
      expect(new Set(slots).size).toBe(5);
      await assertAllWithinViewport(target, ['.reaction-burst']);
      await assertNoOverlaps(target, '.reaction-burst', true);
    }

    const guessers = await waitForGuessers(players);
    const fakes: string[] = [];
    for (const [index, guesser] of guessers.entries()) {
      const prefix = `MAX-${index}-`;
      const fake = `${prefix}${'X'.repeat(60 - prefix.length)}`;
      fakes.push(fake);
      await guesser.getByPlaceholder('Something that sounds legit…').fill(fake);
      await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
    }
    await expect(tv.getByText('Which title is real?')).toBeVisible();
    for (const [index, voter] of guessers.entries()) {
      const targetFake = fakes[(index + 1) % fakes.length];
      await voter.locator('button.vote-option:not([disabled])', { hasText: targetFake }).click();
    }

    const results = tv.locator('.results-panel.display-results');
    await expect(results).toHaveAttribute('data-reveal-stage', 'correct', { timeout: 10_000 });
    await expect(results.locator('.breakdown-row')).toHaveCount(8);
    await expect(results.locator('.option-label')).toHaveText(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    await assertDisplayPhaseFits(tv, { width: 1280, height: 720 });
    await assertAllWithinViewport(tv, ['.result-sidebar', '.breakdown-row', '.option-label']);

    await expect(results).toHaveAttribute('data-reveal-stage', 'complete', { timeout: 10_000 });
    await expect(results.locator('.causal-score-event')).not.toHaveCount(0);
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
      { width: 3840, height: 2160 }
    ]) {
      await tv.setViewportSize(viewport);
      await assertDisplayPhaseFits(tv, viewport);
      const selectors = [
        '.result-summary',
        '.result-sidebar',
        '.causal-score-event',
        '.score-total',
        '.advance-panel',
        '#deadline-text',
        '#advance-button'
      ];
      if (viewport.width === 3840) selectors.push('.breakdown-row', '.option-label');
      await assertAllWithinViewport(tv, selectors);
      if (viewport.width === 3840) {
        const answerSizes = await results
          .locator('.breakdown-answer')
          .evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
        const metaSizes = await results
          .locator('.breakdown-kind, .causal-score-event, .score-total')
          .evaluateAll((elements) =>
            elements.map((element) => ({
              className: element.className,
              size: Number.parseFloat(getComputedStyle(element).fontSize)
            }))
        );
        expect(answerSizes.every((size) => size >= 24)).toBe(true);
        expect(metaSizes.every(({ size }) => size >= 18), JSON.stringify(metaSizes)).toBe(true);
      }
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});
