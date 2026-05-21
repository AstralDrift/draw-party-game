import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

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

    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy']);
    await expect(tv.locator('.player-row')).toHaveCount(players.length);
    for (const player of players) {
      await expect(tv.getByText(player.name, { exact: true })).toBeVisible();
    }

    await tv.getByRole('button', { name: 'Start Game' }).click();
    await expect(tv.getByText('Players are drawing')).toBeVisible();

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
      await expect(tv.getByText('What is this?')).toBeVisible();
      const artistIndex = await waitForArtistIndex(players);
      const guessers = players.filter((_, index) => index !== artistIndex);

      for (const [guessIndex, guesser] of guessers.entries()) {
        await expect(guesser.page.getByPlaceholder('Fake answer')).toBeVisible();
        await guesser.page.getByPlaceholder('Fake answer').fill(`wrong answer ${turn} ${guesser.name}`);
        await guesser.page.getByRole('button', { name: 'Submit Guess' }).click();
        if (guessIndex < guessers.length - 1) {
          await expect(guesser.page.getByText('Guess submitted.')).toBeVisible();
        }
      }

      await expect(tv.getByText('Vote for the real prompt')).toBeVisible();
      for (const voter of guessers) {
        const option = voter.page.locator('button.vote-option:not([disabled])').first();
        await expect(option).toBeVisible();
        await option.click();
      }

      await expect(tv.getByText('The real prompt was')).toBeVisible();
      await expect(tv.locator('.round-outcome')).toHaveText(/found it|No one found it/);
      await expect(tv.locator('.breakdown-row')).toHaveCount(3);
      await expect(tv.locator('.breakdown-kind', { hasText: 'Correct answer' })).toHaveCount(1);
      await expect(tv.locator('.breakdown-kind', { hasText: /Fake answer by/ })).toHaveCount(2);
      await expect(tv.locator('.chip-label').first()).toHaveText('Voted by');

      for (const player of players) {
        await expect(player.page.getByText('The real prompt was')).toBeVisible();
      }

      await tv.getByRole('button', { name: 'Continue' }).click();
    }

    await expect(tv.getByText('Players are drawing')).toBeVisible();
    await expect(tv.getByText(/Round 2 of \d+/)).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

function makeAppUrl(baseURL: string | undefined): (path: string) => string {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required for Draw Party e2e tests.');
  }
  return (path: string) => new URL(path, baseURL).toString();
}

async function createPlayers(
  browser: Browser,
  contexts: BrowserContext[],
  appUrl: (path: string) => string,
  roomCode: string,
  names: string[]
): Promise<TestPlayer[]> {
  const players: TestPlayer[] = [];
  for (const name of names) {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 }
    });
    contexts.push(context);

    const page = await context.newPage();
    await page.goto(appUrl(`/join/${roomCode}`));
    await expect(page.locator('input.code-input')).toHaveValue(roomCode);
    await page.getByPlaceholder('Your name').fill(name);
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.locator('.app-shell.player .brand')).toHaveText('Lobby');
    await expect(page.getByText(`${name}, you're in`)).toBeVisible();
    players.push({ name, page });
  }
  return players;
}

async function drawStroke(page: Page): Promise<void> {
  const canvas = page.locator('canvas.draw-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Drawing canvas did not have a layout box.');
  }

  const points = [
    { x: box.x + box.width * 0.2, y: box.y + box.height * 0.25 },
    { x: box.x + box.width * 0.45, y: box.y + box.height * 0.45 },
    { x: box.x + box.width * 0.7, y: box.y + box.height * 0.3 }
  ];
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    await page.mouse.move(point.x, point.y, { steps: 4 });
  }
  await page.mouse.up();
}

async function waitForArtistIndex(players: TestPlayer[]): Promise<number> {
  let currentArtistIndex = -1;
  await expect
    .poll(async () => {
      const visibleStates = await Promise.all(
        players.map((player) =>
          player.page
            .getByText('This is your drawing. Wait for guesses.')
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
