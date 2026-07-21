import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import {
  assertDisplayLobbyLayout,
  expectNoHorizontalOverflow,
  expectNoVerticalOverflow,
  TV_VIEWPORTS
} from './tv-layout';

type Viewport = {
  width: number;
  height: number;
};

type PlayerTarget = {
  name: string;
  viewport: Viewport;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  minCanvasHeightRatio?: number;
  minCanvasWidth: number;
  minBackingRatio?: number;
};

const PLAYER_TARGETS: PlayerTarget[] = [
  {
    name: 'iphone-se-hidpi',
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    minCanvasHeightRatio: 0.74,
    minCanvasWidth: 370,
    minBackingRatio: 2
  },
  {
    name: 'iphone-standard-hidpi',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    minCanvasHeightRatio: 0.6,
    minCanvasWidth: 385,
    minBackingRatio: 2
  },
  {
    name: 'iphone-pro-max-hidpi',
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    minCanvasHeightRatio: 0.6,
    minCanvasWidth: 425,
    minBackingRatio: 2
  },
  {
    name: 'android-hidpi',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
    isMobile: true,
    minCanvasHeightRatio: 0.59,
    minCanvasWidth: 407,
    minBackingRatio: 2
  },
  {
    name: 'fire-7-portrait',
    viewport: { width: 600, height: 960 },
    deviceScaleFactor: 1.5,
    minCanvasWidth: 360
  },
  {
    name: 'fire-hd-8-portrait',
    viewport: { width: 800, height: 1280 },
    deviceScaleFactor: 1.5,
    minCanvasWidth: 400
  },
  {
    name: 'fire-hd-10-portrait',
    viewport: { width: 1200, height: 1920 },
    deviceScaleFactor: 2,
    minCanvasWidth: 520
  },
  {
    name: 'ipad-portrait',
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    minCanvasWidth: 460
  },
  {
    name: 'ipad-landscape',
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
    minCanvasWidth: 560
  },
  {
    name: 'ipad-pro-portrait',
    viewport: { width: 1024, height: 1366 },
    deviceScaleFactor: 2,
    minCanvasWidth: 640
  },
  {
    name: 'ipad-pro-landscape',
    viewport: { width: 1366, height: 1024 },
    deviceScaleFactor: 2,
    minCanvasWidth: 720
  }
];

test('liquid glass TV lobby fits from 720p through 4K without page scroll', async ({ baseURL, browser }, testInfo) => {
  const appUrl = makeAppUrl(baseURL);

  for (const target of TV_VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: target.width, height: target.height } });
    try {
      const page = await context.newPage();
      await page.goto(appUrl('/'));
      await assertDisplayLobbyLayout(page, target);
      await page.screenshot({ path: testInfo.outputPath(`${target.name}-lobby.png`), fullPage: false });
    } finally {
      await context.close();
    }
  }
});

test('TV remote focus stays visible for liquid glass living-room navigation', async ({ baseURL, browser }, testInfo) => {
  const appUrl = makeAppUrl(baseURL);
  const contexts: BrowserContext[] = [];

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const playerContext = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 }
    });
    contexts.push(playerContext);
    const player = await playerContext.newPage();
    await player.goto(appUrl(`/join/${roomCode}`));
    await player.getByPlaceholder('Your name').fill('Remote');
    await player.getByRole('button', { name: 'Join the Party' }).click();

    const startButton = tv.getByRole('button', { name: 'Start Game' });
    await expect(startButton).toBeEnabled();
    await startButton.focus();

    const focus = await tv.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      const rect = element?.getBoundingClientRect();
      const style = element ? window.getComputedStyle(element) : null;
      return {
        text: element?.textContent?.trim() ?? '',
        outline: style?.outlineStyle ?? 'none',
        top: rect?.top ?? 0,
        bottom: rect?.bottom ?? 0,
        scrollY: window.scrollY,
        innerHeight: window.innerHeight
      };
    });
    expect(focus.text).toContain('Start Game');
    expect(focus.outline).not.toBe('none');
    expect(focus.top).toBeGreaterThanOrEqual(0);
    expect(focus.bottom).toBeLessThanOrEqual(focus.innerHeight + 4);
    expect(focus.scrollY).toBe(0);

    await tv.screenshot({ path: testInfo.outputPath('tvbro-remote-focus.png'), fullPage: false });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('TV guessing phase fits 720p without page scroll', async ({ baseURL, browser }) => {
  const appUrl = makeAppUrl(baseURL);
  const contexts: BrowserContext[] = [];
  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const players: Page[] = [];
    for (const name of ['FitA', 'FitB']) {
      const playerContext = await browser.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 }
      });
      contexts.push(playerContext);
      const player = await playerContext.newPage();
      await player.goto(appUrl(`/join/${roomCode}`));
      await player.getByPlaceholder('Your name').fill(name);
      await player.getByRole('button', { name: 'Join the Party' }).click();
      await expect(player.locator('.app-shell.player .brand')).toHaveText('Lobby');
      players.push(player);
    }

    await expect(tv.getByRole('button', { name: 'Start Game' })).toBeEnabled();
    await tv.getByRole('button', { name: 'Start Game' }).click();
    for (const player of players) {
      await expect(player.locator('canvas.draw-canvas')).toBeVisible({ timeout: 15_000 });
      await drawStroke(player);
      await expect(player.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expect(tv.getByText('What did they draw?')).toBeVisible();
    await expectNoHorizontalOverflow(tv);
    await expectNoVerticalOverflow(tv);
    const revealBottom = await tv.evaluate(() => {
      const canvas = document.querySelector('.reveal-canvas');
      if (!canvas) {
        throw new Error('Missing reveal canvas');
      }
      return canvas.getBoundingClientRect().bottom;
    });
    expect(revealBottom).toBeLessThanOrEqual(720 + 4);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('phone, Fire tablet, and iPad drawing layouts keep canvas and submit reachable', async ({ baseURL, browser }, testInfo) => {
  const appUrl = makeAppUrl(baseURL);

  for (const target of PLAYER_TARGETS) {
    const contexts: BrowserContext[] = [];
    try {
      const { player } = await startSoloDrawing(browser, contexts, appUrl, target);
      const metrics = await playerMetrics(player);

      expect(metrics.scrollWidth).toBeLessThanOrEqual(target.viewport.width + 1);
      expect(metrics.canvas.width).toBeGreaterThanOrEqual(target.minCanvasWidth);
      if (target.minCanvasHeightRatio) {
        expect(metrics.canvas.height).toBeGreaterThanOrEqual(target.viewport.height * target.minCanvasHeightRatio);
      }
      // Phones stack canvas above submit; tablets place them side-by-side (same row top).
      if (target.viewport.width < 700) {
        expect(metrics.canvas.top).toBeLessThanOrEqual(metrics.submit.top);
      } else {
        expect(Math.abs(metrics.canvas.top - metrics.submit.top)).toBeLessThanOrEqual(4);
      }
      expect(metrics.submit.bottom).toBeLessThanOrEqual(target.viewport.height + 4);
      expect(metrics.tools.bottom).toBeLessThanOrEqual(target.viewport.height + 4);
      const aspect = metrics.canvas.width / Math.max(1, metrics.canvas.height);
      const expectedAspect = target.viewport.width < 700 ? 3 / 4 : 4 / 3;
      expect(aspect).toBeGreaterThan(expectedAspect - 0.08);
      expect(aspect).toBeLessThan(expectedAspect + 0.08);
      if (target.minBackingRatio) {
        expect(metrics.backingRatio).toBeGreaterThanOrEqual(target.minBackingRatio);
      }

      await player.screenshot({ path: testInfo.outputPath(`${target.name}-drawing.png`), fullPage: false });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
});

function makeAppUrl(baseURL: string | undefined): (path: string) => string {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required for Draw Party e2e tests.');
  }
  return (path: string) => new URL(path, baseURL).toString();
}

async function startSoloDrawing(
  browser: Browser,
  contexts: BrowserContext[],
  appUrl: (path: string) => string,
  target: PlayerTarget
): Promise<{ player: Page; tv: Page }> {
  const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  contexts.push(tvContext);
  const tv = await tvContext.newPage();
  await tv.goto(appUrl('/'));
  await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
  const roomCode = (await tv.locator('.room-code').innerText()).trim();

  const playerContext = await browser.newContext({
    hasTouch: true,
    isMobile: target.isMobile ?? false,
    deviceScaleFactor: target.deviceScaleFactor ?? 1,
    viewport: target.viewport
  });
  contexts.push(playerContext);
  const player = await playerContext.newPage();
  await player.goto(appUrl(`/join/${roomCode}`));
  await player.getByPlaceholder('Your name').fill(target.name);
  await player.getByRole('button', { name: 'Join the Party' }).click();
  await tv.getByRole('button', { name: 'Start Game' }).click();
  await expect(player.locator('canvas.draw-canvas')).toBeVisible();
  return { player, tv };
}

async function playerMetrics(page: Page): Promise<{
  backingRatio: number;
  canvas: DOMRect;
  scrollWidth: number;
  submit: DOMRect;
  tools: DOMRect;
}> {
  return page.evaluate(() => {
    const rect = (selector: string): DOMRect => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing ${selector}`);
      }
      return element.getBoundingClientRect().toJSON();
    };
    const canvas = document.querySelector('canvas.draw-canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error('Missing drawing canvas');
    }
    const canvasRect = canvas.getBoundingClientRect().toJSON();
    return {
      backingRatio: canvas.width / canvasRect.width,
      canvas: canvasRect,
      scrollWidth: document.documentElement.scrollWidth,
      submit: rect('.submit-dock'),
      tools: rect('.tools-drawer')
    };
  });
}

async function drawStroke(page: Page): Promise<void> {
  const canvas = page.locator('canvas.draw-canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox();
      return Boolean(box && box.width >= 100 && box.height >= 75);
    })
    .toBe(true);

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
    fire('pointermove', 0.45, 0.4);
    fire('pointermove', 0.7, 0.55);
    fire('pointerup', 0.7, 0.55, 0);
  });
}
