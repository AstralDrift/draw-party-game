import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import {
  assertDisplayLobbyLayout,
  expectNoHorizontalOverflow,
  expectNoVerticalOverflow,
  TV_VIEWPORTS
} from './tv-layout';
import {
  completeCurrentReveal,
  createPlayers,
  expectTvGuessingStage,
  expectTvVotingStage,
  expectWithinViewportHeight,
  makeAppUrl,
  startParty,
  startPractice,
  waitForGuessers,
  waitForPagesWithVisibleLocatorCount
} from './helpers';

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

    for (const name of ['Remote', 'Second', 'Third']) {
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
    }

    const startButton = tv.getByRole('button', { name: 'Start from TV (fallback)' });
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
    expect(focus.text).toBe('');
    expect(await startButton.getAttribute('aria-label')).toBe('Start from TV (fallback)');
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
    for (const name of ['FitA', 'FitB', 'FitC']) {
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

    await expect(tv.getByRole('button', { name: 'Start from TV (fallback)' })).toBeEnabled();
    await tv.getByRole('button', { name: 'Start from TV (fallback)' }).click();
    for (const player of players) {
      await expect(player.locator('canvas.draw-canvas')).toBeVisible({ timeout: 15_000 });
      await drawStroke(player);
      await expect(player.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
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
      await expect(player.getByRole('button', { name: 'Submit Drawing' })).toHaveCount(0);
      await drawStroke(player);
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
      expect(
        metrics.promptFontSize,
        `${target.name}: prompt must outrank the clock`
      ).toBeGreaterThanOrEqual(metrics.deadlineFontSize);
      expect(metrics.submit.bottom).toBeLessThanOrEqual(target.viewport.height + 4);
      expect(metrics.tools.bottom).toBeLessThanOrEqual(target.viewport.height + 4);
      expect(metrics.interactiveTargets.length).toBeGreaterThan(0);
      for (const interactiveTarget of metrics.interactiveTargets) {
        expect(interactiveTarget.width, `${target.name}: ${interactiveTarget.label} width`).toBeGreaterThanOrEqual(52);
        expect(interactiveTarget.height, `${target.name}: ${interactiveTarget.label} height`).toBeGreaterThanOrEqual(52);
      }
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

test('Fire tablet and iPad keep fake title and vote grids within the viewport', async ({ baseURL, browser }) => {
  const appUrl = makeAppUrl(baseURL);
  const tabletTargets = [
    { label: 'fire-hd-8-portrait', viewport: { width: 800, height: 1280 } },
    { label: 'ipad-portrait', viewport: { width: 768, height: 1024 } }
  ] as const;

  for (const target of tabletTargets) {
    const contexts: BrowserContext[] = [];
    try {
      const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      contexts.push(tvContext);
      const tv = await tvContext.newPage();
      await tv.goto(appUrl('/'));
      const roomCode = (await tv.locator('.room-code').innerText()).trim();
      const phone = { width: 390, height: 844, isMobile: true as const };
      const players = await createPlayers(
        browser,
        contexts,
        appUrl,
        roomCode,
        ['Ava', 'Bo', 'Cy', 'Dee'],
        [phone, target.viewport, phone, phone]
      );
      const tablet = players[1];
      await startParty(players[0]);
      for (const player of players) {
        await drawStroke(player);
        await player.getByRole('button', { name: 'Submit Drawing' }).click();
      }

      let tabletChecked = false;
      for (let reveal = 0; reveal < players.length; reveal += 1) {
        await expectTvGuessingStage(tv);
        const guessers = await waitForGuessers(players);
        if (guessers.includes(tablet)) {
          const titleField = tablet.getByPlaceholder('Something that sounds legit…');
          await expect(titleField).toBeFocused();
          await expectWithinViewportHeight(
            tablet,
            'input[placeholder="Something that sounds legit…"]',
            target.viewport.height
          );
          await titleField.fill(`${target.label} couch fake`);
          await expectWithinViewportHeight(
            tablet,
            'button:has-text("Submit Fake Title")',
            target.viewport.height
          );
          await tablet.getByRole('button', { name: 'Submit Fake Title' }).click();
          tabletChecked = true;
        } else {
          await completeCurrentReveal(tv, players, `${target.label}-skip-${reveal}`);
          continue;
        }

        for (const guesser of guessers) {
          if (guesser === tablet) {
            continue;
          }
          await guesser.getByPlaceholder('Something that sounds legit…').fill(`${target.label}-other`);
          await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
        }

        await expectTvVotingStage(tv);
        const voters = await waitForPagesWithVisibleLocatorCount(
          players,
          'button.vote-option:not([disabled])',
          Math.max(0, players.length - 1)
        );
        if (voters.includes(tablet)) {
          await expectWithinViewportHeight(tablet, '.player-vote-list', target.viewport.height);
          await expectWithinViewportHeight(
            tablet,
            'button.vote-option:not([disabled])',
            target.viewport.height
          );
          await tablet.locator('button.vote-option:not([disabled])').first().click();
        }
        for (const voter of voters) {
          if (voter === tablet) {
            continue;
          }
          await voter.locator('button.vote-option:not([disabled])').first().click();
        }
        await expect(tv.locator('.results-panel.display-results')).toHaveAttribute('data-reveal-stage', 'complete', {
          timeout: 18_000
        });
        break;
      }

      expect(tabletChecked, `${target.label} must act as a guesser in a four-phone party`).toBe(true);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
});

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
  await startPractice(player);
  await expect(player.locator('canvas.draw-canvas')).toBeVisible();
  return { player, tv };
}

async function playerMetrics(page: Page): Promise<{
  backingRatio: number;
  canvas: DOMRect;
  deadlineFontSize: number;
  interactiveTargets: Array<{ height: number; label: string; width: number }>;
  promptFontSize: number;
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
    const prompt = document.querySelector('#prompt-text');
    const deadline = document.querySelector('#deadline-text');
    if (!canvas) {
      throw new Error('Missing drawing canvas');
    }
    if (!prompt || !deadline) {
      throw new Error('Missing drawing prompt or deadline');
    }
    const canvasRect = canvas.getBoundingClientRect().toJSON();
    return {
      backingRatio: canvas.width / canvasRect.width,
      canvas: canvasRect,
      deadlineFontSize: parseFloat(getComputedStyle(deadline).fontSize),
      interactiveTargets: Array.from(document.querySelectorAll<HTMLElement>('.drawing-turn button, .drawing-turn summary'))
        .map((element) => ({ element, target: element.getBoundingClientRect() }))
        .filter(({ target }) => target.width > 0 && target.height > 0)
        .map(({ element, target }) => ({
          height: target.height,
          label: `${element.tagName.toLowerCase()}.${element.className}`,
          width: target.width
        })),
      promptFontSize: parseFloat(getComputedStyle(prompt).fontSize),
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
