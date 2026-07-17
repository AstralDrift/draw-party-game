import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

test('late join mid-drawing becomes spectator and promotes next round', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    await tv.locator('.settings-panel input').first().fill('2');
    await tv.getByRole('button', { name: 'Save Settings' }).click();

    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo']);
    await tv.getByRole('button', { name: 'Start Game' }).click();
    await expect(tv.getByText('Phones are drawing')).toBeVisible();

    for (const player of players) {
      await expect(player.locator('#prompt-text')).toContainText(/^Draw:/);
    }

    const lateContext = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 }
    });
    contexts.push(lateContext);
    const late = await lateContext.newPage();
    await late.goto(appUrl(`/join/${roomCode}`));
    await late.getByPlaceholder('Your name').fill('Late');
    await late.getByRole('button', { name: 'Join the Party' }).click();

    await expect(late.getByText('Spectating', { exact: false })).toBeVisible({ timeout: 5000 });
    await expect(late.getByText(/Watching|join as a player|next drawing round/i).first()).toBeVisible();
    await expect(late.locator('canvas.draw-canvas')).toHaveCount(0);
    await expect(tv.locator('.spectator-watchers').getByText('Late')).toBeVisible();
    await expect(tv.locator('.spectator-watchers .spectator-pill').first()).toBeVisible();

    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    // Burn through the first round of reveals so the room advances to round 2 drawing.
    for (let turn = 0; turn < players.length; turn += 1) {
      await expect(tv.getByText('What did they draw?')).toBeVisible();
      const guessers = await waitForGuessers(players);
      for (const [index, guesser] of guessers.entries()) {
        await guesser.getByPlaceholder('Something that sounds legit…').fill(`late fake ${turn} ${index}`);
        await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
      }
      await expect(tv.getByText('Which title is real?')).toBeVisible();
      for (const voter of guessers) {
        await voter.locator('button.vote-option:not([disabled])').first().click();
      }
      await expect(tv.getByText('The real prompt was')).toBeVisible();
      await expect(tv.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 7000 });
      await tv.getByRole('button', { name: 'Continue' }).click();
    }

    await expect(tv.getByText('Phones are drawing')).toBeVisible();
    await expect(tv.getByText(/Round 2 of \d+/)).toBeVisible();
    await expect(late.locator('#prompt-text')).toContainText(/^Draw:/, { timeout: 5000 });
    await expect(late.getByRole('button', { name: 'Submit Drawing' })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('disconnected drawer does not stall drawing phase', async ({ baseURL, browser }) => {
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
    await tv.getByRole('button', { name: 'Start Game' }).click();
    await expect(tv.getByText('Phones are drawing')).toBeVisible();

    const dropout = players[2];
    await dropout.context().close();
    const remaining = players.slice(0, 2);

    for (const player of remaining) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expect(tv.getByText('What did they draw?')).toBeVisible({ timeout: 10000 });
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
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
  const players: Page[] = [];
  for (const name of names) {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 }
    });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(appUrl(`/join/${roomCode}`));
    await page.getByPlaceholder('Your name').fill(name);
    await page.getByRole('button', { name: 'Join the Party' }).click();
    await expect(page.getByText(`${name}, you're in`)).toBeVisible();
    players.push(page);
  }
  return players;
}

async function drawStroke(page: Page): Promise<void> {
  const canvas = page.locator('canvas.draw-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Missing canvas box');
  }
  await page.evaluate(
    ({ x, y, width, height }) => {
      const target = document.querySelector('canvas.draw-canvas');
      if (!(target instanceof HTMLCanvasElement)) {
        throw new Error('Missing draw canvas');
      }
      const startX = x + width * 0.25;
      const startY = y + height * 0.35;
      const endX = x + width * 0.7;
      const endY = y + height * 0.65;
      for (const [type, clientX, clientY] of [
        ['pointerdown', startX, startY],
        ['pointermove', endX, endY],
        ['pointerup', endX, endY]
      ] as const) {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            clientX,
            clientY,
            buttons: type === 'pointerup' ? 0 : 1
          })
        );
      }
    },
    box
  );
}

async function waitForGuessers(players: Page[]): Promise<Page[]> {
  const expected = Math.max(0, players.length - 1);
  await expect
    .poll(async () => {
      let count = 0;
      for (const player of players) {
        if (await player.getByPlaceholder('Something that sounds legit…').isVisible().catch(() => false)) {
          count += 1;
        }
      }
      return count;
    })
    .toBe(expected);

  const found: Page[] = [];
  for (const player of players) {
    if (await player.getByPlaceholder('Something that sounds legit…').isVisible().catch(() => false)) {
      found.push(player);
    }
  }
  return found;
}
