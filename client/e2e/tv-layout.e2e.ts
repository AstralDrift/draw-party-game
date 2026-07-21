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

test('TV layout gate: eight max-length player names stay visible from 720p through 4K', async ({
  baseURL,
  browser
}) => {
  const appUrl = makeAppUrl(baseURL);
  const contexts: BrowserContext[] = [];
  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();
    const names = Array.from({ length: 8 }, (_, index) =>
      `Player ${index + 1} ${'W'.repeat(24)}`.slice(0, 24)
    );
    await createPlayers(browser, contexts, appUrl, roomCode, names);

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
      { width: 3840, height: 2160 }
    ]) {
      await tv.setViewportSize(viewport);
      await assertDisplayLobbyLayout(tv, viewport);
      await expect(tv.locator('.players-panel .player-row')).toHaveCount(8);
      const rosterMetrics = await tv.locator('.players-panel .player-list').evaluate((list) => ({
        clientHeight: list.clientHeight,
        clientWidth: list.clientWidth,
        scrollHeight: list.scrollHeight,
        scrollWidth: list.scrollWidth,
        rows: Array.from(list.querySelectorAll('.player-row')).map((row) => {
          const rect = row.getBoundingClientRect();
          const name = row.querySelector('.player-name')?.getBoundingClientRect();
          const meta = row.querySelector('.player-meta')?.getBoundingClientRect();
          return {
            height: rect.height,
            width: rect.width,
            nameHeight: name?.height,
            nameWidth: name?.width,
            metaWidth: meta?.width
          };
        })
      }));
      expect(
        rosterMetrics.scrollHeight <= rosterMetrics.clientHeight + 2,
        `${viewport.width}×${viewport.height} roster must fit: ${JSON.stringify(rosterMetrics)}`
      ).toBe(true);
      await assertAllWithinViewport(tv, [
        '.players-panel',
        '.players-panel .player-list',
        '.players-panel .player-row',
        '.players-panel .player-name',
        '.players-panel .player-status',
        '.players-panel .host-badge',
        '.settings-summary-panel',
        '.sound-toggle'
      ]);
      await assertNoOverlaps(tv, '.players-panel .player-row');
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
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

test('TV layout gate: reduced-motion eight-player results stay staged and readable through 4K', async ({
  baseURL,
  browser
}) => {
  test.setTimeout(90_000);
  const appUrl = makeAppUrl(baseURL);
  const contexts: BrowserContext[] = [];
  try {
    const tvContext = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 1280, height: 720 }
    });
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
    const shortTvAnswerSizes = await results
      .locator('.breakdown-answer')
      .evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
    const shortTvMetaSizes = await results
      .locator('.breakdown-kind, .option-label, .chip-label, .vote-chip')
      .evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
    expect(shortTvAnswerSizes.every((size) => size >= 16), JSON.stringify(shortTvAnswerSizes)).toBe(true);
    expect(shortTvMetaSizes.every((size) => size >= 13), JSON.stringify(shortTvMetaSizes)).toBe(true);

    await expect(results).toHaveAttribute('data-reveal-stage', 'deltas', { timeout: 10_000 });
    await expect(results.locator('.causal-score-event')).not.toHaveCount(0);
    const shortTvScoreSizes = await results
      .locator('.causal-score-event, .score-total')
      .evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
    expect(shortTvScoreSizes.every((size) => size >= 13), JSON.stringify(shortTvScoreSizes)).toBe(true);
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
