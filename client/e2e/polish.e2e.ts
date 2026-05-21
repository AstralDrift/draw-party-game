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
    await expect(ava.locator('.draw-toolbar')).toBeVisible();
    await expect(ava.getByRole('button', { name: 'Submit Drawing' })).toBeVisible();
    await expect(bo.locator('canvas.draw-canvas')).toBeVisible();

    const canvasBox = await ava.locator('canvas.draw-canvas').boundingBox();
    const toolbarBox = await ava.locator('.draw-toolbar').boundingBox();
    if (!canvasBox || !toolbarBox) {
      throw new Error('Drawing canvas and toolbar must have layout boxes.');
    }
    expect(canvasBox.y).toBeLessThan(toolbarBox.y);
    expect(canvasBox.width).toBeGreaterThan(300);
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
