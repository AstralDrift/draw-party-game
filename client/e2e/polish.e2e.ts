import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

test('phone join screen starts neutral and renders local validation errors', async ({ baseURL, page }) => {
  const appUrl = makeAppUrl(baseURL);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl('/join/ABCD'));

  await expect(page.locator('#connection-text')).toHaveText('Ready to join');
  await expect(page.getByText('Disconnected')).toHaveCount(0);

  await page.locator('input.code-input').fill('AB');
  await page.getByPlaceholder('Your name').fill('Ava');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter the four-letter room code from the TV.');

  await page.locator('input.code-input').fill('ABCD');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('phone drawing screen prioritizes canvas before controls on mobile', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const [ava, bo] = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo']);
    await tv.getByRole('button', { name: 'Start Game' }).click();

    await expect(ava.locator('canvas.draw-canvas')).toBeVisible();
    await expect(ava.getByRole('button', { name: 'Draw before submitting' })).toBeDisabled();
    await expect(ava.locator('.tools-summary')).toContainText('Tools');
    await expect(ava.locator('.draw-toolbar')).toBeHidden();
    await expect(bo.locator('canvas.draw-canvas')).toBeVisible();

    const canvasBox = await ava.locator('canvas.draw-canvas').boundingBox();
    const drawerBox = await ava.locator('.tools-drawer').boundingBox();
    if (!canvasBox || !drawerBox) {
      throw new Error('Drawing canvas and tools drawer must have layout boxes.');
    }
    expect(canvasBox.y).toBeLessThan(drawerBox.y);
    expect(canvasBox.width).toBeGreaterThan(320);

    await drawStroke(ava);
    await expect(ava.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();

    await ava.locator('.tools-summary').click();
    await expect(ava.locator('.draw-toolbar')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('phone vote selection stays visible while other players are still voting', async ({ baseURL, browser }) => {
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
    const guessers = await advanceToVoting(tv, players);

    const voter = guessers[0];
    const waitingVoter = guessers[1];
    const option = voter.locator('button.vote-option:not([disabled])').first();
    await expect(option).toBeVisible();
    const answer = (await option.locator('.vote-answer').innerText()).trim();
    await option.click();

    const selected = voter.locator('button.vote-option.is-selected');
    await expect(selected).toContainText(answer);
    await expect(selected).toContainText('Your vote');
    await expect(tv.getByText('Vote for the real prompt')).toBeVisible();
    await expect(waitingVoter.locator('button.vote-option:not([disabled])').first()).toBeVisible();
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
): Promise<Page[]> {
  const pages: Page[] = [];
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
    await expect(page.getByText('Watch the TV.')).toBeVisible();
    pages.push(page);
  }
  return pages;
}

async function advanceToVoting(tv: Page, players: Page[]): Promise<Page[]> {
  await tv.getByRole('button', { name: 'Start Game' }).click();
  await expect(tv.getByText('Players are drawing')).toBeVisible();

  for (const player of players) {
    await drawStroke(player);
    await expect(player.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
    await player.getByRole('button', { name: 'Submit Drawing' }).click();
  }

  await expect(tv.getByText('What is this?')).toBeVisible();
  const artistIndex = await waitForArtistIndex(players);
  const guessers = players.filter((_, index) => index !== artistIndex);
  for (const [guessIndex, guesser] of guessers.entries()) {
    await expect(guesser.getByPlaceholder('Fake answer')).toBeVisible();
    await guesser.getByPlaceholder('Fake answer').fill(`fake answer ${guessIndex}`);
    await guesser.getByRole('button', { name: 'Submit Guess' }).click();
  }

  await expect(tv.getByText('Vote for the real prompt')).toBeVisible();
  return guessers;
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

async function waitForArtistIndex(players: Page[]): Promise<number> {
  let currentArtistIndex = -1;
  await expect
    .poll(async () => {
      const visibleStates = await Promise.all(
        players.map((page) =>
          page
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
