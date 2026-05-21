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

test('TV lobby gives room code and QR the showcase hierarchy', async ({ baseURL, page }) => {
  const appUrl = makeAppUrl(baseURL);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(appUrl('/'));

  await expect(page.locator('.room-code')).toHaveText(/[A-Z]{4}/);
  await expect(page.locator('.qr')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByText('Everybody draws. Everybody guesses.')).toBeVisible();
  await expect(page.locator('.settings-panel')).toBeVisible();

  const roomPanel = await page.locator('.room-panel').boundingBox();
  const settingsPanel = await page.locator('.settings-panel').boundingBox();
  if (!roomPanel || !settingsPanel) {
    throw new Error('TV lobby panels must have layout boxes.');
  }
  expect(roomPanel.width).toBeGreaterThan(420);
  expect(roomPanel.height).toBeGreaterThan(settingsPanel.height * 0.65);
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
    await expect(ava.getByRole('button', { name: 'Submit Drawing' })).toBeVisible();
    await expect(ava.locator('#prompt-text')).toContainText(/^Draw:/);
    await expect(ava.locator('#deadline-text')).toHaveText(/\d+:\d{2}/);
    await expect(ava.locator('.tools-summary')).toContainText('Tools');
    await expect(ava.locator('.draw-toolbar')).toBeHidden();
    await expect(bo.locator('canvas.draw-canvas')).toBeVisible();

    const canvasBox = await ava.locator('canvas.draw-canvas').boundingBox();
    const drawerBox = await ava.locator('.tools-drawer').boundingBox();
    const submitBox = await ava.getByRole('button', { name: 'Submit Drawing' }).boundingBox();
    if (!canvasBox || !drawerBox || !submitBox) {
      throw new Error('Drawing canvas and tools drawer must have layout boxes.');
    }
    expect(canvasBox.y).toBeLessThan(drawerBox.y);
    expect(canvasBox.width).toBeGreaterThan(320);
    expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(844);

    await ava.locator('.tools-summary').click();
    await expect(ava.locator('.draw-toolbar')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('one-round finale renders podium and scores without overflow', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    await tv.locator('.settings-panel input').first().fill('1');
    await tv.getByRole('button', { name: 'Save Settings' }).click();
    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo']);

    await tv.getByRole('button', { name: 'Start Game' }).click();
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    for (let turn = 0; turn < players.length; turn += 1) {
      await expect(tv.getByText('What is this?')).toBeVisible();
      const guessers = await waitForPagesWithVisibleLocator(players, 'input[placeholder="Fake answer"]');
      for (const [index, guesser] of guessers.entries()) {
        await guesser.getByPlaceholder('Fake answer').fill(`fake finale ${turn} ${index}`);
        await guesser.getByRole('button', { name: 'Submit Guess' }).click();
      }

      await expect(tv.getByText('Vote for the real prompt')).toBeVisible();
      const voters = await waitForPagesWithVisibleLocator(players, 'button.vote-option:not([disabled])');
      for (const voter of voters) {
        await voter.locator('button.vote-option:not([disabled])').first().click();
      }

      await expect(tv.getByText('The real prompt was')).toBeVisible();
      await tv.getByRole('button', { name: 'Continue' }).click();
    }

    await expect(tv.getByText('Final Podium')).toBeVisible();
    await expect(tv.locator('.podium-place')).toHaveCount(2);
    await expect(tv.locator('.score-row')).toHaveCount(2);

    const scoresPanel = await tv.locator('.scores-panel').boundingBox();
    if (!scoresPanel) {
      throw new Error('Scores panel must have a layout box.');
    }
    expect(scoresPanel.y + scoresPanel.height).toBeLessThanOrEqual(720);
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
    pages.push(page);
  }
  return pages;
}

async function drawStroke(page: Page): Promise<void> {
  const canvas = page.locator('canvas.draw-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Drawing canvas did not have a layout box.');
  }

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.46, box.y + box.height * 0.48, { steps: 4 });
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.28, { steps: 4 });
  await page.mouse.up();
}

async function waitForPagesWithVisibleLocator(pages: Page[], selector: string): Promise<Page[]> {
  let matches: Page[] = [];
  await expect
    .poll(async () => {
      matches = await pagesWithVisibleLocator(pages, selector);
      return matches.length;
    })
    .toBeGreaterThan(0);
  return matches;
}

async function pagesWithVisibleLocator(pages: Page[], selector: string): Promise<Page[]> {
  const matches: Page[] = [];
  for (const page of pages) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) {
      matches.push(page);
    }
  }
  return matches;
}
