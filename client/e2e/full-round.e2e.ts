import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createPlayers, drawStroke, makeAppUrl } from './helpers';

interface TestPlayer {
  name: string;
  page: Page;
}

test('one TV and three phones complete a full drawing round', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));

    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const names = ['Ava', 'Bo', 'Cy'];
    const pages = await createPlayers(browser, contexts, appUrl, roomCode, names);
    const players: TestPlayer[] = pages.map((page, index) => ({ name: names[index], page }));
    await expect(tv.locator('.player-row')).toHaveCount(players.length);
    for (const player of players) {
      await expect(tv.getByText(player.name, { exact: true })).toBeVisible();
    }

    await tv.getByRole('button', { name: 'Start Game' }).click();
    await expect(tv.getByText('Phones are drawing')).toBeVisible();

    for (const [index, player] of players.entries()) {
      await expect(player.page.locator('#prompt-text')).toContainText(/^Draw:/);
      await drawStroke(player.page);
      await expect(player.page.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
      await player.page.getByRole('button', { name: 'Submit Drawing' }).click();
      if (index < players.length - 1) {
        await expect(player.page.getByText('Drawing submitted. Watch the TV.')).toBeVisible();
      }
    }

    for (let turn = 0; turn < players.length; turn += 1) {
      await expect(tv.getByText('What did they draw?')).toBeVisible();
      const artistIndex = await waitForArtistIndex(players);
      const guessers = players.filter((_, index) => index !== artistIndex);

      for (const [guessIndex, guesser] of guessers.entries()) {
        await expect(guesser.page.getByPlaceholder('Something that sounds legit…')).toBeVisible();
        await guesser.page
          .getByPlaceholder('Something that sounds legit…')
          .fill(`wrong answer ${turn} ${guesser.name}`);
        await guesser.page.getByRole('button', { name: 'Submit Fake Title' }).click();
        if (guessIndex < guessers.length - 1) {
          await expect(guesser.page.getByText('Title locked in. Waiting for the room…')).toBeVisible();
        }
      }

      await expect(tv.getByText('Which title is real?')).toBeVisible();
      for (const voter of guessers) {
        const option = voter.page.locator('button.vote-option:not([disabled])').first();
        await expect(option).toBeVisible();
        await option.click();
      }

      await expect(tv.getByText('The real prompt was')).toBeVisible();
      await expect(tv.locator('.round-outcome')).toHaveText(/cracked it|Nobody got it|saw through it/);
      await expect(tv.locator('.breakdown-row')).toHaveCount(3);
      await expect(tv.locator('.breakdown-kind', { hasText: 'Correct answer' })).toHaveCount(1);
      await expect(tv.locator('.breakdown-kind', { hasText: /Fake by/ })).toHaveCount(2);
      await expect(tv.locator('.chip-label').first()).toHaveText('Voted by');

      for (const player of players) {
        await expect(player.page.getByText('The real prompt was')).toBeVisible();
      }

      await expect(tv.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 7000 });
      await tv.getByRole('button', { name: 'Continue' }).click();
    }

    await expect(tv.getByText('Phones are drawing')).toBeVisible();
    await expect(tv.getByText(/Round 2 of \d+/)).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

async function waitForArtistIndex(players: TestPlayer[]): Promise<number> {
  let currentArtistIndex = -1;
  await expect
    .poll(async () => {
      const visibleStates = await Promise.all(
        players.map((player) =>
          player.page
            .getByText(/You.?re the artist\. Sit back and enjoy the chaos/)
            .isVisible()
            .catch(() => false)
        )
      );
      const visibleIndices = visibleStates
        .map((isVisible, index) => (isVisible ? index : -1))
        .filter((index) => index >= 0);
      currentArtistIndex = visibleIndices.length === 1 ? visibleIndices[0] : -1;
      return currentArtistIndex;
    })
    .toBeGreaterThanOrEqual(0);
  return currentArtistIndex;
}
