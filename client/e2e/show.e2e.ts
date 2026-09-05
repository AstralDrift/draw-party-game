import { expect, test, type BrowserContext } from '@playwright/test';
import { createPlayers, drawStroke, startParty, waitForGuessers, makeAppUrl, assertAllWithinViewport } from './helpers';

test('game show spotlights a convincing fake and fits eight players on 720p and 4K TVs', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);
  try {
    const display = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(display);
    const tv = await display.newPage();
    await tv.goto(appUrl('/'));
    const code = (await tv.locator('.room-code').innerText()).trim();
    const players = await createPlayers(browser, contexts, appUrl, code,
      ['Ava', 'Bo', 'Cy', 'Dee', 'Eli', 'Flo', 'Gus', 'Hazel']);
    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }
    const guessers = await waitForGuessers(players);
    for (const [index, player] of guessers.entries()) {
      await player.getByPlaceholder('Something that sounds legit…').fill(`A very suspicious goose wearing ${index + 1} enormous raincoats`);
      await player.getByRole('button', { name: 'Submit Fake Title' }).click();
    }
    for (const [index, player] of guessers.entries()) {
      const target = index === 0 ? 2 : 1;
      await player.getByRole('button', { name: new RegExp(`goose wearing ${target} enormous`) }).click();
    }
    for (const stage of ['tally', 'spotlight', 'correct', 'deltas'] as const) {
      await expect(tv.locator('.show-results')).toHaveAttribute('data-reveal-stage', stage);
      const selector = { tally: '.show-ballot-row', spotlight: '.show-fake-title', correct: '.show-truth-copy', deltas: '.show-score-row' }[stage];
      for (const viewport of [{ width: 1280, height: 720 }, { width: 3840, height: 2160 }]) {
        await tv.setViewportSize(viewport);
        await assertAllWithinViewport(tv, [selector]);
        await tv.screenshot({ path: testInfo.outputPath(`${stage}-${viewport.width}.png`) });
      }
      if (stage === 'spotlight') {
        await expect(tv.locator('.show-fake-title')).toContainText('1 enormous raincoats');
        await expect(tv.locator('.show-fake-credit')).toContainText('FAKE');
        await expect(tv.locator('.reveal-prompt')).toHaveCount(0);
        await expect(players[0].getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
        // The display refresh must resume this beat, not replay the tally.
        await tv.reload();
        await expect(tv.locator('.show-results')).toHaveAttribute('data-reveal-stage', /spotlight|correct/);
      }
    }
    await expect(tv.locator('.show-score-row')).toHaveCount(8);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('TV audio offers music and effects without changing room settings', async ({ page, baseURL }) => {
  await page.goto(makeAppUrl(baseURL)('/'));
  await page.getByRole('button', { name: 'Game audio: Off', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Music + Effects' }).click();
  await expect(page.getByRole('button', { name: 'Game audio: Music + Effects', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Game audio: Music + Effects', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Music + Effects' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio', { name: 'Off', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Game audio: Off', exact: true })).toBeVisible();
});
