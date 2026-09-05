import { expect, test, type BrowserContext, type TestInfo } from '@playwright/test';
import {
  assertAllWithinViewport,
  assertNoOverlaps,
  createPlayers,
  drawStroke,
  expectTvVotingStage,
  expectUniformVoteLetterHeights,
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
  expectNoHorizontalOverflow,
  expectNoVerticalOverflow,
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
        '.players-panel .host-badge',
        '.start-button',
        '.sound-toggle'
      ]);
      await expect(tv.locator('.players-panel .player-status')).toHaveCount(0);
      await expect(tv.locator('.settings-summary')).toHaveCount(0);
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
      const canvasBox = await page.locator('.reveal-canvas').boundingBox();
      if (!canvasBox) {
        throw new Error('Missing reveal canvas');
      }
      expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(viewport.height + 4);
      if (viewport.width >= 3200) {
        expect(canvasBox.height).toBeGreaterThan(900);
        expect(canvasBox.width).toBeGreaterThan(1200);
      }
      await captureLayoutShot(page, shotName, `${viewport.name} · guessing`, testInfo);
    }
  });
});

test('TV layout gate: reduced-motion eight-player results stay staged and readable through 4K', async ({
  baseURL,
  browser
}) => {
  test.setTimeout(120_000);
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
    const sePhone = { width: 375, height: 667, isMobile: true };
    const players = await createPlayers(
      browser,
      contexts,
      appUrl,
      roomCode,
      names,
      names.map(() => sePhone)
    );
    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    const guessers = await waitForGuessers(players);
    const fakes: string[] = [];
    for (const [index, guesser] of guessers.entries()) {
      const prefix = `MAX-${index}-`;
      const fake = `${prefix}${'X'.repeat(60 - prefix.length)}`;
      fakes.push(fake);
      await guesser.getByPlaceholder('Something that sounds legit…').fill(fake);
      await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
      if (index < 5) {
        await guesser.getByRole('button', { name: '😂' }).click();
      }
      if (index === 4) {
        for (const target of [tv, guessers[0]]) {
          await expect(target.locator('.reaction-layer')).toHaveCount(1);
          await expect(target.locator('.reaction-burst')).toHaveCount(5);
          const slots = await target.locator('.reaction-burst').evaluateAll((elements) =>
            elements.map((element) => element.getAttribute('data-slot'))
          );
          expect(new Set(slots).size).toBe(5);
          await assertAllWithinViewport(target, ['.reaction-burst']);
          await assertNoOverlaps(target, '.reaction-burst', true);
        }
      }
    }

    await expectTvVotingStage(tv);
    await expect(tv.locator('.display-grid-voting .turn-header .progress-panel')).toBeVisible();
    await expect(tv.locator('.display-grid-voting .vote-list > .progress-panel')).toHaveCount(0);
    await assertDisplayPhaseFits(tv, { width: 1280, height: 720 });
    await assertAllWithinViewport(tv, ['.vote-list', '.vote-answer', '.option-label']);
    for (const voter of guessers) {
      await expectNoHorizontalOverflow(voter);
      await expectNoVerticalOverflow(voter);
      await assertAllWithinViewport(voter, ['.player-vote-list', 'button.vote-option', '.option-label']);
      await expectUniformVoteLetterHeights(voter);
    }
    for (const [index, voter] of guessers.entries()) {
      const targetFake = fakes[(index + 1) % fakes.length];
      await voter.locator('button.vote-option:not([disabled])', { hasText: targetFake }).click();
    }

    const results = tv.locator('.results-panel.display-results');
    await expect(results).toBeVisible({ timeout: 10_000 });
    if ((await results.getAttribute('data-reveal-stage')) === 'hold') {
      await expect(results.locator('.result-summary > .eyebrow')).toHaveCount(0);
      await expect(results).toHaveAttribute('data-reveal-stage', 'tally');
    }
    if ((await results.getAttribute('data-reveal-stage')) === 'tally') {
      await expect(results.locator('.result-summary')).toBeHidden();
      await expect(results.locator('.result-canvas')).toBeHidden();
      await expect(results.locator('.breakdown-kind')).toHaveCount(0);
      await expect(results.locator('.vote-chip')).toHaveCount(0);
      await expect(results.getByText('Voted by')).toHaveCount(0);
      await expect(results.getByText('No votes')).toHaveCount(0);
      await expect(results.locator('.show-ballot-row')).toHaveCount(8);
      await expect(results.locator('.option-label')).toHaveText(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
      await assertDisplayPhaseFits(tv, { width: 1280, height: 720 });
      await assertAllWithinViewport(tv, ['.show-ballot', '.show-ballot-row', '.option-label']);
    }
    await expect(results).toHaveAttribute('data-reveal-stage', 'correct', { timeout: 10_000 });
    await expect(results.locator('.reveal-prompt')).toBeVisible();
    await expect(results.locator('.show-truth .result-canvas')).toBeVisible();
    await expect(results.locator('.result-summary > .eyebrow')).toHaveCount(0);
    await expect(results.locator('.round-outcome')).toBeHidden();
    await expect(results.locator('.breakdown')).toBeHidden();
    await assertDisplayPhaseFits(tv, { width: 1280, height: 720 });
    await assertAllWithinViewport(tv, ['.show-truth', '.reveal-prompt']);
    const promptSize = await results
      .locator('.reveal-prompt')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(promptSize).toBeGreaterThanOrEqual(32);

    await expect(results).toHaveAttribute('data-reveal-stage', 'deltas', { timeout: 10_000 });
    await expect(results.locator('.show-score-row')).not.toHaveCount(0);
    await expect(results.locator('.round-outcome')).toBeVisible();
    await expect(results.locator('.result-summary')).toBeHidden();
    await expect(results.locator('.reveal-prompt')).toBeHidden();
    const shortTvScoreSizes = await results
      .locator('.round-outcome, .show-score-row, .show-score-total')
      .evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
    expect(shortTvScoreSizes.every((size) => size >= 18), JSON.stringify(shortTvScoreSizes)).toBe(true);
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1366, height: 768 },
      { width: 3840, height: 2160 }
    ]) {
      await tv.setViewportSize(viewport);
      await expect
        .poll(async () =>
          tv.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
            wide: window.matchMedia('(min-width: 3200px)').matches
          }))
        )
        .toEqual({
          width: viewport.width,
          height: viewport.height,
          wide: viewport.width >= 3200
        });
      await assertDisplayPhaseFits(tv, viewport);
      const selectors = [
        '.show-scores',
        '.round-outcome',
        '.show-score-row',
        '.show-score-total',
        '.advance-panel',
        '#deadline-text'
      ];
      await assertAllWithinViewport(tv, selectors);
      await expect(results.locator('.breakdown')).toBeHidden();
      await expect(results.locator('.result-summary')).toBeHidden();
      if (viewport.width === 3840) {
        await expect
          .poll(async () => {
            const sizes = await results
              .locator('.round-outcome, .show-score-row, .show-score-total')
              .evaluateAll((elements) =>
                elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
              );
            return sizes.length > 0 && sizes.every((size) => size >= 28);
          })
          .toBe(true);
      }
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});
