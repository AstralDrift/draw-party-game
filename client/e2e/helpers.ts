import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export type PlayerViewport = {
  width: number;
  height: number;
  isMobile?: boolean;
};

export function makeAppUrl(baseURL: string | undefined): (path: string) => string {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required for Draw Party e2e tests.');
  }
  return (path: string) => new URL(path, baseURL).toString();
}

export async function createPlayers(
  browser: Browser,
  contexts: BrowserContext[],
  appUrl: (path: string) => string,
  roomCode: string,
  names: string[],
  viewports: PlayerViewport[] = names.map(() => ({ width: 390, height: 844, isMobile: true })),
  prepareContext?: (context: BrowserContext, index: number) => Promise<void>
): Promise<Page[]> {
  const pages: Page[] = [];
  for (const [index, name] of names.entries()) {
    const viewport = viewports[index] ?? viewports[0];
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: viewport.isMobile ?? viewport.width < 700,
      viewport: { width: viewport.width, height: viewport.height }
    });
    contexts.push(context);
    await prepareContext?.(context, index);

    const page = await context.newPage();
    await page.goto(appUrl(`/join/${roomCode}`));
    await expect(page.locator('input.code-input')).toHaveValue(roomCode);
    await page.getByPlaceholder('Your name').fill(name);
    await page.getByRole('button', { name: 'Join the Party' }).click();
    await expect(page.locator('.app-shell.player .brand')).toHaveText('Lobby');
    pages.push(page);
  }
  return pages;
}

export async function drawStroke(page: Page): Promise<void> {
  const canvas = page.locator('canvas.draw-canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox();
      return Boolean(box && box.width >= 100 && box.height >= 75);
    })
    .toBe(true);

  // hasTouch mobile contexts flake on CDP mouse→pointer synthesis; drive the pad
  // with the same PointerEvent path production touch/pen input uses.
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    const fire = (type: string, xRatio: number, yRatio: number, buttons = 1) => {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: 'pen',
          isPrimary: true,
          buttons,
          clientX: rect.left + rect.width * xRatio,
          clientY: rect.top + rect.height * yRatio
        })
      );
    };
    fire('pointerdown', 0.2, 0.25);
    fire('pointermove', 0.33, 0.36);
    fire('pointermove', 0.46, 0.48);
    fire('pointermove', 0.59, 0.38);
    fire('pointermove', 0.72, 0.28);
    fire('pointerup', 0.72, 0.28, 0);
  });
}

export async function waitForPagesWithVisibleLocatorCount(
  pages: Page[],
  selector: string,
  count: number
): Promise<Page[]> {
  await expect
    .poll(async () => {
      let visible = 0;
      for (const page of pages) {
        if (await page.locator(selector).first().isVisible().catch(() => false)) {
          visible += 1;
        }
      }
      return visible;
    })
    .toBe(count);

  const found: Page[] = [];
  for (const page of pages) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) {
      found.push(page);
    }
  }
  return found;
}

export async function waitForGuessers(players: Page[]): Promise<Page[]> {
  return waitForPagesWithVisibleLocatorCount(
    players,
    'input[placeholder="Something that sounds legit…"]',
    Math.max(0, players.length - 1)
  );
}

/** Host phone owns writable lobby settings (TV is read-only). */
export async function hostSaveRounds(host: Page, rounds: string): Promise<void> {
  await expect(host.locator('.settings-panel')).toBeVisible();
  await host.locator('.settings-panel input').first().fill(rounds);
  await host.getByRole('button', { name: 'Save Settings' }).click();
}
