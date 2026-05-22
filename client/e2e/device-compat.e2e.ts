import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

type Viewport = {
  width: number;
  height: number;
};

type PlayerTarget = {
  name: string;
  viewport: Viewport;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  minCanvasWidth: number;
  minBackingRatio?: number;
};

const TV_TARGETS: Array<{ name: string; viewport: Viewport }> = [
  { name: 'tvbro-720p', viewport: { width: 1280, height: 720 } },
  { name: 'tvbro-768p', viewport: { width: 1366, height: 768 } },
  { name: 'full-hd-tv', viewport: { width: 1920, height: 1080 } },
  { name: 'qhd-tv', viewport: { width: 2560, height: 1440 } },
  { name: 'uhd-4k-tv', viewport: { width: 3840, height: 2160 } }
];

const PLAYER_TARGETS: PlayerTarget[] = [
  {
    name: 'iphone-se-hidpi',
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    minCanvasWidth: 300,
    minBackingRatio: 2
  },
  {
    name: 'iphone-standard-hidpi',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    minCanvasWidth: 340,
    minBackingRatio: 2
  },
  {
    name: 'iphone-pro-max-hidpi',
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    minCanvasWidth: 370,
    minBackingRatio: 2
  },
  {
    name: 'android-hidpi',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3,
    isMobile: true,
    minCanvasWidth: 350,
    minBackingRatio: 2
  },
  {
    name: 'fire-7-portrait',
    viewport: { width: 600, height: 960 },
    deviceScaleFactor: 1.5,
    minCanvasWidth: 520
  },
  {
    name: 'fire-hd-8-portrait',
    viewport: { width: 800, height: 1280 },
    deviceScaleFactor: 1.5,
    minCanvasWidth: 540
  },
  {
    name: 'fire-hd-10-portrait',
    viewport: { width: 1200, height: 1920 },
    deviceScaleFactor: 2,
    minCanvasWidth: 780
  },
  {
    name: 'ipad-portrait',
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    minCanvasWidth: 480
  },
  {
    name: 'ipad-landscape',
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
    minCanvasWidth: 620
  },
  {
    name: 'ipad-pro-portrait',
    viewport: { width: 1024, height: 1366 },
    deviceScaleFactor: 2,
    minCanvasWidth: 720
  },
  {
    name: 'ipad-pro-landscape',
    viewport: { width: 1366, height: 1024 },
    deviceScaleFactor: 2,
    minCanvasWidth: 840
  }
];

test('TV Bro style lobby fits from 720p through 4K without page scroll', async ({ baseURL, browser }, testInfo) => {
  const appUrl = makeAppUrl(baseURL);

  for (const target of TV_TARGETS) {
    const context = await browser.newContext({ viewport: target.viewport });
    try {
      const page = await context.newPage();
      await page.goto(appUrl('/'));
      await expect(page.locator('.room-code')).toHaveText(/[A-Z]{4}/);
      await expect(page.locator('.qr')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectNoVerticalOverflow(page);

      const metrics = await tvMetrics(page);
      expect(metrics.qr.bottom).toBeLessThanOrEqual(target.viewport.height + 4);
      expect(metrics.start.bottom).toBeLessThanOrEqual(target.viewport.height + 4);
      expect(metrics.roomCode.height).toBeLessThan(target.viewport.height * 0.18);
      expect(metrics.qr.width).toBeGreaterThanOrEqual(target.viewport.width >= 1800 ? 250 : 180);

      await page.screenshot({ path: testInfo.outputPath(`${target.name}-lobby.png`), fullPage: false });
    } finally {
      await context.close();
    }
  }
});

test('TV remote focus stays visible for TV Bro style navigation', async ({ baseURL, browser }, testInfo) => {
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
    await player.getByRole('button', { name: 'Join' }).click();

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

test('phone, Fire tablet, and iPad drawing layouts keep canvas and submit reachable', async ({ baseURL, browser }, testInfo) => {
  const appUrl = makeAppUrl(baseURL);

  for (const target of PLAYER_TARGETS) {
    const contexts: BrowserContext[] = [];
    try {
      const { player } = await startSoloDrawing(browser, contexts, appUrl, target);
      const metrics = await playerMetrics(player);

      expect(metrics.scrollWidth).toBeLessThanOrEqual(target.viewport.width + 1);
      expect(metrics.canvas.width).toBeGreaterThanOrEqual(target.minCanvasWidth);
      expect(metrics.canvas.top).toBeLessThanOrEqual(metrics.submit.top);
      expect(metrics.submit.bottom).toBeLessThanOrEqual(target.viewport.height + 4);
      expect(metrics.tools.bottom).toBeLessThanOrEqual(target.viewport.height + 4);
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
  await player.getByRole('button', { name: 'Join' }).click();
  await tv.getByRole('button', { name: 'Start Game' }).click();
  await expect(player.locator('canvas.draw-canvas')).toBeVisible();
  return { player, tv };
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => Math.ceil(document.documentElement.scrollWidth) <= Math.ceil(window.innerWidth) + 1)
    )
    .toBe(true);
}

async function expectNoVerticalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => Math.ceil(document.documentElement.scrollHeight) <= Math.ceil(window.innerHeight) + 4)
    )
    .toBe(true);
}

async function tvMetrics(page: Page): Promise<{
  qr: DOMRect;
  roomCode: DOMRect;
  start: DOMRect;
}> {
  return page.evaluate(() => {
    const rect = (selector: string): DOMRect => {
      const element = document.querySelector(selector);
      if (!element) {
        throw new Error(`Missing ${selector}`);
      }
      return element.getBoundingClientRect().toJSON();
    };
    return {
      qr: rect('.qr'),
      roomCode: rect('.room-code'),
      start: rect('.start-button')
    };
  });
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
