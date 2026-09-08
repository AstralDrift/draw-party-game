import { expect, test, type BrowserContext } from '@playwright/test';
import {
  REVEAL_COMPLETE_TIMEOUT_MS,
  collectDrawingPrompts,
  createPlayers,
  drawStroke,
  expectTvDrawingStage,
  expectTvGuessingStage,
  expectTvVotingStage,
  makeAppUrl,
  startParty,
  voteForRealPrompt,
  waitForArtistIndex,
  waitForGuessers
} from './helpers';

test('phone smoke joins, recovers a drawing draft, and reaches results without randomUUID or external requests', async ({
  baseURL,
  browser
}) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);
  const appOrigin = new URL(appUrl('/')).origin;
  const prepareContext = async (context: BrowserContext) => {
    await context.addInitScript(() => {
      // LAN HTTP lacks this secure-context-only convenience method, unlike CI's loopback origin.
      Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
    });
    await context.route(/^https?:\/\//, async (route) => {
      if (new URL(route.request().url()).origin === appOrigin) {
        await route.continue();
      } else {
        await route.abort();
      }
    });
  };

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    await prepareContext(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/^[A-Z]{4}$/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();
    const players = await createPlayers(
      browser,
      contexts,
      appUrl,
      roomCode,
      ['Ava', 'Bo', 'Cy'],
      undefined,
      prepareContext
    );

    for (const player of players) {
      const guide = player.locator('details').filter({ has: player.locator('summary', { hasText: 'How to play' }) });
      await expect(guide).toBeVisible();
      await expect(guide).toHaveJSProperty('open', false);
    }
    const guide = players[1].locator('details').filter({
      has: players[1].locator('summary', { hasText: 'How to play' })
    });
    await guide.locator('summary').click();
    await expect(guide).toHaveJSProperty('open', true);
    await expect(guide).toContainText(/draw/i);
    await guide.locator('summary').click();
    await expect(guide).toHaveJSProperty('open', false);

    // Loading each named family must return actual font faces, not system fallbacks.
    expect(await players[0].evaluate(async () => {
      const families = ['700 16px "Syne"', '400 16px "DM Sans"', '500 16px "IBM Plex Mono"'];
      const faces = await Promise.all(families.map((font) => document.fonts.load(font)));
      await document.fonts.ready;
      return faces.every((family) => family.length > 0 && family.every((font) => font.status === 'loaded'));
    })).toBe(true);

    await startParty(players[0]);
    await expectTvDrawingStage(tv);
    const prompts = await collectDrawingPrompts(players);
    const recovering = players[0];
    await drawStroke(recovering);
    await expect(recovering.locator('.draw-status')).toHaveText('1 stroke');
    await recovering.reload();
    await expect(recovering.locator('.draw-status')).toHaveText('1 stroke');
    await expect(recovering.getByRole('button', { name: 'Join the Party' })).toHaveCount(0);
    await expect(recovering.locator('#prompt-text')).toHaveText(prompts[0]);
    await expect(recovering.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
    await recovering.getByRole('button', { name: 'Submit Drawing' }).click();
    for (const player of players.slice(1)) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
    const artistIndex = await waitForArtistIndex(players);
    const guessers = await waitForGuessers(players);
    for (const [index, guesser] of guessers.entries()) {
      const fakeTitle = guesser.getByRole('textbox', { name: 'Fake title', exact: true });
      await expect(fakeTitle).toHaveAttribute('autocapitalize', 'none');
      await fakeTitle.fill(`Velvet Teacup Orchestra ${index}`);
      await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
    }

    await expectTvVotingStage(tv);
    const ballotTitles = tv.locator('.display-grid-voting .vote-answer');
    expect(await ballotTitles.allTextContents()).toContain('Velvet Teacup Orchestra 0');
    expect(await ballotTitles.evaluateAll((titles) =>
      titles.every((title) => getComputedStyle(title).textTransform === 'lowercase')
    )).toBe(true);
    for (const voter of guessers) {
      await voteForRealPrompt(voter, prompts[artistIndex]);
    }
    await expect(tv.locator('.results-panel.display-results')).toHaveAttribute('data-reveal-stage', 'complete', {
      timeout: REVEAL_COMPLETE_TIMEOUT_MS
    });
    for (const player of players) {
      await expect(player.locator('.app-shell.player .brand')).toHaveText('Results');
    }
    for (const guesser of guessers) {
      await expect(guesser.locator('.personal-score')).toBeVisible();
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});
