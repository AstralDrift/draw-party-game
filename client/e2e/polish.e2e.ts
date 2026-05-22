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
  const viewports = [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(appUrl('/'));

    await expect(page.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    await expect(page.locator('.qr')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
    await expect(page.getByText('Everybody draws. Everybody guesses.')).toBeVisible();
    await expect(page.locator('.settings-panel')).toBeVisible();
    await expectNoVerticalOverflow(page);

    const roomPanel = await page.locator('.room-panel').boundingBox();
    const settingsPanel = await page.locator('.settings-panel').boundingBox();
    const qr = await page.locator('.qr').boundingBox();
    const start = await page.getByRole('button', { name: 'Start Game' }).boundingBox();
    if (!roomPanel || !settingsPanel || !qr || !start) {
      throw new Error('TV lobby panels must have layout boxes.');
    }
    expect(roomPanel.width).toBeGreaterThan(360);
    expect(roomPanel.height).toBeGreaterThan(settingsPanel.height * 0.65);
    expect(qr.y + qr.height).toBeLessThanOrEqual(viewport.height);
    expect(start.y + start.height).toBeLessThanOrEqual(viewport.height);
  }
});

test('large-phone lobby presents player-ready hierarchy without clipping', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const [ava, bo] = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo'], [
      { width: 430, height: 932, isMobile: true },
      { width: 430, height: 932, isMobile: true }
    ]);

    await expect(ava.locator('.player-lobby-card')).toBeVisible();
    await expect(ava.locator('.mini-room-code')).toHaveText(roomCode);
    await expect(ava.getByText('Party is ready')).toBeVisible();
    await expect(ava.locator('.players-panel')).toBeVisible();
    await expect(bo.locator('.player-lobby-card')).toBeVisible();
    await expect(tv.getByRole('button', { name: 'Start Game' })).toBeEnabled();
    await expectNoHorizontalOverflow(ava);

    const lobbyBox = await ava.locator('.player-lobby-card').boundingBox();
    const playersBox = await ava.locator('.players-panel').boundingBox();
    if (!lobbyBox || !playersBox) {
      throw new Error('Large-phone lobby panels must have layout boxes.');
    }
    expect(lobbyBox.y + lobbyBox.height).toBeLessThan(playersBox.y);
    expect(playersBox.width).toBeLessThanOrEqual(430);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
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
    await expect(ava.getByRole('button', { name: 'Submit Drawing' })).toBeDisabled();
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
    expect(canvasBox.width).toBeGreaterThan(340);
    expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(844);

    await drawStroke(ava);
    await expect(ava.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
    await expect(ava.locator('.submit-help')).toHaveText('Ready when you are.');
    await ava.locator('.tools-summary').click();
    await expect(ava.locator('.draw-toolbar')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('iPad portrait and landscape drawing use expanded tools without overflow', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const [portrait, landscape] = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo'], [
      { width: 768, height: 1024 },
      { width: 1024, height: 768 }
    ]);
    await tv.getByRole('button', { name: 'Start Game' }).click();

    for (const page of [portrait, landscape]) {
      await expect(page.locator('canvas.draw-canvas')).toBeVisible();
      await expect(page.locator('.draw-toolbar')).toBeVisible();
      await expect(page.locator('.tools-drawer')).toHaveAttribute('open', '');
      await expect(page.locator('#prompt-text')).toContainText(/^Draw:/);
      await expectNoHorizontalOverflow(page);
    }

    const portraitCanvas = await portrait.locator('canvas.draw-canvas').boundingBox();
    const landscapeCanvas = await landscape.locator('canvas.draw-canvas').boundingBox();
    if (!portraitCanvas || !landscapeCanvas) {
      throw new Error('iPad drawing canvases must have layout boxes.');
    }
    expect(portraitCanvas.width).toBeGreaterThan(480);
    expect(landscapeCanvas.width).toBeGreaterThan(620);

    const portraitSubmit = await portrait.getByRole('button', { name: 'Submit Drawing' }).boundingBox();
    const landscapeSubmit = await landscape.getByRole('button', { name: 'Submit Drawing' }).boundingBox();
    if (!portraitSubmit || !landscapeSubmit) {
      throw new Error('iPad submit buttons must have layout boxes.');
    }
    expect(portraitSubmit.y + portraitSubmit.height).toBeLessThanOrEqual(1024);
    expect(landscapeSubmit.y + landscapeSubmit.height).toBeLessThanOrEqual(768);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('solo drawing keeps live ink stable, ignores extra touches, and submits dense strokes', async ({ baseURL, browser }) => {
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

    const [player] = await createPlayers(browser, contexts, appUrl, roomCode, ['Solo']);
    await expect(tv.getByRole('button', { name: 'Start Game' })).toBeEnabled();
    await tv.getByRole('button', { name: 'Start Game' }).click();

    await drawStroke(player);
    await expect.poll(() => hasCanvasInkNear(player, 0.46, 0.48)).toBe(true);

    const canvas = player.locator('canvas.draw-canvas');
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error('Drawing canvas did not have a layout box.');
    }
    await player.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.68);
    await player.mouse.down();
    await player.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.66, { steps: 8 });
    await expect.poll(() => hasCanvasInkNear(player, 0.46, 0.48)).toBe(true);
    await player.mouse.up();
    await expect(player.locator('.draw-status')).toHaveText('2 strokes');

    await dispatchTwoFingerStroke(player);
    await expect(player.locator('.draw-status')).toHaveText('3 strokes');

    await dispatchDenseStroke(player);
    await expect(player.locator('.draw-status')).toHaveText('4 strokes');
    await player.getByRole('button', { name: 'Submit Drawing' }).click();

    await expect(tv.getByText('The real prompt was')).toBeVisible();
    await expect(player.getByText('The real prompt was')).toBeVisible();
    await tv.getByRole('button', { name: 'Continue' }).click();
    await expect(tv.getByText('Final Podium')).toBeVisible();
    await expect(player.getByText('Final Podium')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('phone vote selection stays confirmed while the table is still voting', async ({ baseURL, browser }) => {
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
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expect(tv.getByText('What is this?')).toBeVisible();
    const guessers = await waitForPagesWithVisibleLocatorCount(players, 'input[placeholder="Fake answer"]', 2);
    for (const [index, guesser] of guessers.entries()) {
      await guesser.getByPlaceholder('Fake answer').fill(`fake vote ${index}`);
      await guesser.getByRole('button', { name: 'Submit Guess' }).click();
    }

    await expect(tv.getByText('Vote for the real prompt')).toBeVisible();
    const voters = await waitForPagesWithVisibleLocatorCount(players, 'button.vote-option:not([disabled])', 2);
    const voter = voters[0];
    await voter.locator('button.vote-option:not([disabled])').first().click();
    await expect(voter.locator('.vote-option.is-selected')).toBeVisible();
    await expect(voter.locator('.vote-option.is-selected .vote-reason')).toHaveText('Your vote');
    await expectNoHorizontalOverflow(voter);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('TV progress names submitted players and who is still waiting', async ({ baseURL, browser }) => {
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
    const players = await createPlayers(browser, contexts, appUrl, roomCode, names);
    const nameForPage = new Map<Page, string>(players.map((player, index) => [player, names[index]]));
    await tv.getByRole('button', { name: 'Start Game' }).click();
    await expect(tv.getByText('Players are drawing')).toBeVisible();

    await drawStroke(players[0]);
    await players[0].getByRole('button', { name: 'Submit Drawing' }).click();
    await expectProgressSummary(tv, 'Drawings', '1/3', ['Ava', 'drawing in'], ['Bo', 'waiting'], ['Cy', 'waiting']);
    await expectNoVerticalOverflow(tv);

    for (const player of players.slice(1)) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expect(tv.getByText('What is this?')).toBeVisible();
    const guessers = await waitForPagesWithVisibleLocatorCount(players, 'input[placeholder="Fake answer"]', 2);
    const artist = players.find((player) => !guessers.includes(player));
    const firstGuesserName = nameForPage.get(guessers[0]) ?? '';
    const secondGuesserName = nameForPage.get(guessers[1]) ?? '';
    const artistName = artist ? (nameForPage.get(artist) ?? '') : '';

    await guessers[0].getByPlaceholder('Fake answer').fill('first fake');
    await guessers[0].getByRole('button', { name: 'Submit Guess' }).click();
    await expectProgressSummary(
      tv,
      'Guesses',
      '1/2',
      [firstGuesserName, 'guess in'],
      [secondGuesserName, 'waiting'],
      [artistName, 'artist']
    );
    await expectNoVerticalOverflow(tv);

    await guessers[1].getByPlaceholder('Fake answer').fill('second fake');
    await guessers[1].getByRole('button', { name: 'Submit Guess' }).click();

    await expect(tv.getByText('Vote for the real prompt')).toBeVisible();
    const voters = await waitForPagesWithVisibleLocatorCount(players, 'button.vote-option:not([disabled])', 2);
    const firstVoterName = nameForPage.get(voters[0]) ?? '';
    const secondVoterName = nameForPage.get(voters[1]) ?? '';
    const voteArtist = players.find((player) => !voters.includes(player));
    const voteArtistName = voteArtist ? (nameForPage.get(voteArtist) ?? '') : '';

    await voters[0].locator('button.vote-option:not([disabled])').first().click();
    await expectProgressSummary(
      tv,
      'Votes',
      '1/2',
      [firstVoterName, 'voted'],
      [secondVoterName, 'waiting'],
      [voteArtistName, 'artist']
    );
    await expect(tv.locator('.display-grid-voting > .vote-list')).toBeVisible();
    await expectNoVerticalOverflow(tv);
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

    for (const player of players) {
      await expect(player.locator('.scores-panel')).toBeVisible();
      await expect(player.locator('.winner-callout')).toBeVisible();
      await expect(player.locator('.podium-place')).toHaveCount(2);
      await expectNoHorizontalOverflow(player);
      const playerScoresPanel = await player.locator('.scores-panel').boundingBox();
      if (!playerScoresPanel) {
        throw new Error('Player scores panel must have a layout box.');
      }
      expect(playerScoresPanel.y + playerScoresPanel.height).toBeLessThanOrEqual(844);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

type PlayerViewport = {
  width: number;
  height: number;
  isMobile?: boolean;
};

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
  names: string[],
  viewports: PlayerViewport[] = names.map(() => ({ width: 390, height: 844, isMobile: true }))
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

async function expectProgressSummary(
  page: Page,
  title: string,
  count: string,
  ...rows: Array<[string, string]>
): Promise<void> {
  const panel = page.locator('.progress-panel', { hasText: title });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.big-count')).toHaveText(count);
  for (const [name, status] of rows) {
    await expect(panel.locator('.submission-row', { hasText: name }).locator('.status-pill')).toHaveText(status);
  }
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const root = document.documentElement;
        return Math.ceil(root.scrollWidth) <= Math.ceil(window.innerWidth) + 1;
      })
    )
    .toBe(true);
}

async function expectNoVerticalOverflow(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const root = document.documentElement;
        return Math.ceil(root.scrollHeight) <= Math.ceil(window.innerHeight) + 4;
      })
    )
    .toBe(true);
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

async function hasCanvasInkNear(page: Page, xRatio: number, yRatio: number): Promise<boolean> {
  return page.locator('canvas.draw-canvas').evaluate(
    (canvas: HTMLCanvasElement, point) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return false;
      }
      const centerX = Math.round(canvas.width * point.xRatio);
      const centerY = Math.round(canvas.height * point.yRatio);
      for (let offsetY = -6; offsetY <= 6; offsetY += 1) {
        for (let offsetX = -6; offsetX <= 6; offsetX += 1) {
          const x = Math.min(canvas.width - 1, Math.max(0, centerX + offsetX));
          const y = Math.min(canvas.height - 1, Math.max(0, centerY + offsetY));
          const [red, green, blue] = Array.from(ctx.getImageData(x, y, 1, 1).data);
          if (red < 245 || green < 245 || blue < 245) {
            return true;
          }
        }
      }
      return false;
    },
    { xRatio, yRatio }
  );
}

async function dispatchTwoFingerStroke(page: Page): Promise<void> {
  await page.locator('canvas.draw-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const fire = (type: string, pointerId: number, xRatio: number, yRatio: number, buttons = 1) => {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: 'touch',
          isPrimary: pointerId === 21,
          buttons,
          clientX: rect.left + rect.width * xRatio,
          clientY: rect.top + rect.height * yRatio
        })
      );
    };
    fire('pointerdown', 21, 0.12, 0.16);
    fire('pointermove', 21, 0.22, 0.2);
    fire('pointerdown', 22, 0.84, 0.84);
    fire('pointermove', 22, 0.92, 0.92);
    fire('pointerup', 22, 0.92, 0.92, 0);
    fire('pointermove', 21, 0.36, 0.24);
    fire('pointerup', 21, 0.36, 0.24, 0);
  });
}

async function dispatchDenseStroke(page: Page): Promise<void> {
  await page.locator('canvas.draw-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const fire = (type: string, pointerId: number, xRatio: number, yRatio: number, buttons = 1) => {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: 'pen',
          isPrimary: true,
          buttons,
          clientX: rect.left + rect.width * xRatio,
          clientY: rect.top + rect.height * yRatio
        })
      );
    };
    fire('pointerdown', 31, 0.1, 0.28);
    for (let index = 1; index <= 260; index += 1) {
      const xRatio = 0.1 + 0.8 * (index / 260);
      const yRatio = 0.45 + Math.sin(index / 7) * 0.18;
      fire('pointermove', 31, xRatio, yRatio);
    }
    fire('pointerup', 31, 0.9, 0.45, 0);
  });
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

async function waitForPagesWithVisibleLocatorCount(pages: Page[], selector: string, count: number): Promise<Page[]> {
  let matches: Page[] = [];
  await expect
    .poll(async () => {
      matches = await pagesWithVisibleLocator(pages, selector);
      return matches.length;
    })
    .toBe(count);
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
