import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import {
  canvasHasInkNear,
  completeCurrentReveal,
  createPlayers,
  drawTopLeftLandmark,
  drawStroke,
  hostSaveRounds,
  makeAppUrl,
  startParty,
  startPractice,
  waitForArtistIndex,
  waitForGuessers,
  waitForPagesWithVisibleLocatorCount,
  type PlayerViewport
} from './helpers';

test('mixed motion preferences keep Continue behind the shared show beat', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);
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
      reducedMotion: 'reduce',
      viewport: { width: 390, height: 844 }
    });
    contexts.push(playerContext);
    const player = await playerContext.newPage();
    await player.goto(appUrl(`/join/${roomCode}`));
    await player.getByPlaceholder('Your name').fill('Reveal');
    await player.getByRole('button', { name: 'Join the Party' }).click();
    await startPractice(player);
    await expect(player.locator('canvas.draw-canvas')).toBeVisible();
    const canvas = player.locator('canvas.draw-canvas');
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error('Missing canvas box');
    }
    await player.mouse.move(box.x + 40, box.y + 40);
    await player.mouse.down();
    await player.mouse.move(box.x + 120, box.y + 90, { steps: 6 });
    await player.mouse.up();
    await player.getByRole('button', { name: 'Submit Drawing' }).click();
    await expect(tv.locator('#advance-button')).toBeVisible();
    await expect(tv.locator('#advance-button')).toBeDisabled();
    const playerContinue = player.getByRole('button', { name: 'Continue' });
    await expect(playerContinue).toBeVisible();
    await expect(playerContinue).toBeDisabled();
    await expect(tv.locator('#advance-button')).toBeEnabled({ timeout: 8000 });
    await expect(playerContinue).toBeEnabled();
    await expect(tv.locator('.results-panel')).toHaveAttribute('data-reveal-stage', 'complete');
    const tvContinue = tv.getByRole('button', {
      name: 'Continue from TV (fallback)',
      exact: true
    });
    await expect(tvContinue).toBeVisible();
    await expect(tvContinue).toHaveClass(/btn--ghost/);
    await expect(player.locator('.spotlight-button')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('manual join keyboard flow requires a name and joins exactly once', async ({ baseURL, browser }) => {
  const appUrl = makeAppUrl(baseURL);
  const contexts: BrowserContext[] = [];
  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const phoneContext = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 375, height: 667 }
    });
    contexts.push(phoneContext);
    const phone = await phoneContext.newPage();
    await phone.goto(appUrl('/join'));

    await expect(phone.locator('#connection-text')).toHaveText('Ready to join');
    const code = phone.locator('input.code-input');
    const name = phone.getByPlaceholder('Your name');
    await code.fill(roomCode);
    await code.press('Enter');
    await expect(name).toBeFocused();
    await expect(tv.locator('.player-row')).toHaveCount(0);

    await name.press('Enter');
    await expect(phone.getByRole('alert')).toHaveText(/enter your name/i);
    await expect(tv.locator('.player-row')).toHaveCount(0);

    await name.fill('Keyboard Ava');
    await name.press('Enter');
    await expect(phone.locator('.app-shell.player .brand')).toHaveText('Lobby');
    await expect(tv.locator('.player-row')).toHaveCount(1);
    await expect(tv.locator('.player-name-text', { hasText: /^Keyboard Ava$/ })).toHaveText('Keyboard Ava');
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('QR join confirms the room and offers a manual fallback without an editable code', async ({ baseURL, browser }) => {
  const appUrl = makeAppUrl(baseURL);
  const contexts: BrowserContext[] = [];
  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const phoneContext = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 }
    });
    contexts.push(phoneContext);
    const phone = await phoneContext.newPage();
    await phone.goto(appUrl(`/join/${roomCode}`));

    await expect(phone.locator('.player-room-chip')).toContainText(roomCode);
    await expect(phone.locator('input.code-input')).toHaveCount(0);
    await expect(phone.getByPlaceholder('Your name')).toBeFocused();
    await phone.getByRole('button', { name: 'Change room' }).click();
    await expect(phone).toHaveURL(/\/join$/);
    await expect(phone.locator('input.code-input')).toBeVisible();

    await phone.goto(appUrl(`/join/${roomCode}`));
    await phone.getByPlaceholder('Your name').fill('QR Quinn');
    await phone.getByRole('button', { name: 'Join the Party' }).click();
    await expect(phone.locator('.app-shell.player .brand')).toHaveText('Lobby');
    await expect(tv.locator('.player-name-text', { hasText: /^QR Quinn$/ })).toHaveText('QR Quinn');
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
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
    await expect(page.getByRole('button', { name: 'Start from TV (fallback)' })).toBeVisible();
    await expect(page.getByText('Everybody draws. Everybody guesses.')).toBeVisible();
    await expect(page.locator('.settings-panel')).toBeVisible();
    const roomCode = (await page.locator('.room-code').innerText()).trim();
    await expect(page.locator('.manual-join')).toContainText('/join');
    await expect(page.locator('.manual-join')).toContainText(roomCode);
    const manualJoinFontSize = await page
      .locator('.manual-join')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(manualJoinFontSize).toBeGreaterThanOrEqual(14);
    await expectNoVerticalOverflow(page);

    const roomPanel = await page.locator('.room-panel').boundingBox();
    const settingsPanel = await page.locator('.settings-panel').boundingBox();
    const qr = await page.locator('.qr').boundingBox();
    const start = await page.getByRole('button', { name: 'Start from TV (fallback)' }).boundingBox();
    if (!roomPanel || !settingsPanel || !qr || !start) {
      throw new Error('TV lobby panels must have layout boxes.');
    }
    expect(roomPanel.width).toBeGreaterThan(360);
    expect(roomPanel.height).toBeGreaterThan(settingsPanel.height * 0.65);
    expect(qr.y + qr.height).toBeLessThanOrEqual(viewport.height);
    expect(start.y + start.height).toBeLessThanOrEqual(viewport.height);
    expect(start.width).toBeGreaterThanOrEqual(52);
    expect(start.height).toBeGreaterThanOrEqual(52);
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

    const [ava] = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava'], [
      { width: 430, height: 932, isMobile: true }
    ]);

    await expect(ava.locator('.player-lobby-card')).toBeVisible();
    await expect(ava.locator('.mini-room-code')).toHaveText(roomCode);
    await expectMinimumTouchTarget(ava.getByRole('button', { name: 'Edit name' }));
    await expectMinimumTouchTarget(ava.locator('.settings-preset').first());
    await expectMinimumTouchTarget(ava.locator('.settings-advanced > summary'));
    await ava.locator('.settings-advanced > summary').click();
    await expectMinimumTouchTarget(ava.locator('.settings-advanced .compact-input').first());
    await ava.locator('.settings-advanced > summary').click();
    await expect(ava.getByRole('button', { name: 'Start Party' })).toBeDisabled();
    await expect(ava.getByRole('button', { name: 'Practice Drawing' })).toBeEnabled();
    const [bo] = await createPlayers(browser, contexts, appUrl, roomCode, ['Bo'], [
      { width: 430, height: 932, isMobile: true }
    ]);
    await expect(ava.getByRole('button', { name: 'Practice Drawing' })).toBeDisabled();
    await expect(ava.getByText(/1 more|one more/i)).toBeVisible();
    await expect(ava.getByRole('button', { name: 'Edit name' })).toBeVisible();
    await expect(ava.locator('.players-panel')).toBeVisible();
    await expect(bo.locator('.player-lobby-card')).toBeVisible();
    await expect(tv.getByRole('button', { name: 'Start from TV (fallback)' })).toBeDisabled();
    await expectNoHorizontalOverflow(ava);

    const [cy] = await createPlayers(browser, contexts, appUrl, roomCode, ['Cy'], [
      { width: 430, height: 932, isMobile: true }
    ]);
    await expect(ava.getByRole('button', { name: 'Start Party' })).toBeEnabled();
    await expect(bo.getByText('Party is ready')).toBeVisible();
    await expect(cy.getByText('Party is ready')).toBeVisible();
    await expect(tv.getByRole('button', { name: 'Start from TV (fallback)' })).toBeEnabled();

    await ava.getByRole('button', { name: 'Edit name' }).click();
    await ava.getByLabel('Your name').fill('Ava Renamed');
    await ava.getByRole('button', { name: 'Save name' }).click();
    await expect(ava.getByText("Ava Renamed, you're the host")).toBeVisible();
    await expect(tv.locator('.player-name-text', { hasText: /^Ava Renamed$/ })).toHaveText('Ava Renamed');

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

    const [ava, bo] = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy']);
    await startParty(ava);

    await expect(ava.locator('canvas.draw-canvas')).toBeVisible();
    await expect(ava.getByRole('button', { name: 'Submit Drawing' })).toBeVisible();
    await expect(ava.getByRole('button', { name: 'Submit Drawing' })).toBeDisabled();
    await expect(ava.locator('#prompt-text')).toContainText(/^Draw:/);
    await expect(ava.locator('#deadline-text')).toHaveText(/\d+:\d{2}/);
    await expect(ava.locator('.tools-summary')).toContainText('Tools');
    await expect(ava.locator('.draw-toolbar')).toBeHidden();
    await expect(bo.locator('canvas.draw-canvas')).toBeVisible();
    await expectMinimumTouchTarget(ava.locator('.tools-summary'));
    await expectMinimumTouchTarget(ava.getByRole('button', { name: 'Submit Drawing' }));

    const toolsContrast = await ava.locator('.tools-summary').evaluate((summary) => {
      const drawer = summary.closest('.tools-drawer');
      if (!drawer) {
        throw new Error('Drawing tools summary must be inside its drawer.');
      }

      const parseRgb = (value: string): number[] =>
        (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const luminance = (rgb: number[]): number => {
        const channels = rgb.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
      };

      const foreground = luminance(parseRgb(getComputedStyle(summary).color));
      const background = luminance(parseRgb(getComputedStyle(drawer).backgroundColor));
      const lighter = Math.max(foreground, background);
      const darker = Math.min(foreground, background);
      return (lighter + 0.05) / (darker + 0.05);
    });
    expect(toolsContrast).toBeGreaterThanOrEqual(4.5);

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
    await expectMinimumTouchTarget(ava.locator('.swatch').nth(1));
    await expectMinimumTouchTarget(ava.getByRole('button', { name: 'Clear drawing' }));
    await ava.locator('.swatch').nth(1).click();
    await expect(ava.locator('.swatch').nth(1)).toHaveClass(/is-selected/);
    await expect(ava.getByRole('button', { name: /eraser/i })).toBeVisible();
    await ava.getByRole('button', { name: 'Clear drawing' }).click();
    await expect(ava.getByRole('button', { name: 'Tap again to clear drawing' })).toBeVisible();
    await expect(ava.locator('.draw-status')).toHaveText('Tap clear again to erase everything.');
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

    const [portrait, landscape] = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy'], [
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 390, height: 844, isMobile: true }
    ]);
    await startParty(portrait);

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

test('portrait-phone and tablet landmarks keep their orientation on the TV', async ({ baseURL, browser }) => {
  test.setTimeout(60_000);
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);
  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();
    const players = await createPlayers(
      browser,
      contexts,
      appUrl,
      roomCode,
      ['Portrait', 'Tablet', 'Filler'],
      [
        { width: 390, height: 844, isMobile: true },
        { width: 768, height: 1024 },
        { width: 390, height: 844, isMobile: true }
      ]
    );
    await startParty(players[0]);
    await drawTopLeftLandmark(players[0]);
    await drawTopLeftLandmark(players[1]);
    await drawStroke(players[2]);
    for (const player of players) {
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    let sawPortrait = false;
    let sawTablet = false;
    for (let reveal = 0; reveal < players.length; reveal += 1) {
      await expect(tv.getByText('What did they draw?')).toBeVisible();
      const artistIndex = await waitForArtistIndex(players);
      if (artistIndex === 0) {
        await expect.poll(() => canvasHasInkNear(tv, 'canvas.reveal-canvas', 0.3, 0.1)).toBe(true);
        await expect.poll(() => canvasHasInkNear(tv, 'canvas.reveal-canvas', 0.1, 0.86)).toBe(false);
        sawPortrait = true;
      }
      if (artistIndex === 1) {
        await expect.poll(() => canvasHasInkNear(tv, 'canvas.reveal-canvas', 0.14, 0.1)).toBe(true);
        sawTablet = true;
      }
      await completeCurrentReveal(tv, players, `orientation-${reveal}`);
    }
    expect(sawPortrait).toBe(true);
    expect(sawTablet).toBe(true);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
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

    const [player] = await createPlayers(browser, contexts, appUrl, roomCode, ['Solo']);
    await hostSaveRounds(player, '1');
    await startPractice(player);

    await drawStroke(player);
    await expect(player.locator('.draw-status')).toHaveText('1 stroke');
    await expect.poll(() => hasCanvasInkNear(player, 0.48, 0.54)).toBe(true);

    const canvas = player.locator('canvas.draw-canvas');
    await canvas.evaluate((element: HTMLCanvasElement) => {
      const rect = element.getBoundingClientRect();
      const fire = (type: string, xRatio: number, yRatio: number, buttons = 1) => {
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 2,
            pointerType: 'pen',
            isPrimary: true,
            buttons,
            clientX: rect.left + rect.width * xRatio,
            clientY: rect.top + rect.height * yRatio
          })
        );
      };
      fire('pointerdown', 0.18, 0.68);
      fire('pointermove', 0.4, 0.67);
      fire('pointermove', 0.62, 0.66);
      fire('pointerup', 0.62, 0.66, 0);
    });
    await expect.poll(() => hasCanvasInkNear(player, 0.66, 0.6)).toBe(true);
    await expect(player.locator('.draw-status')).toHaveText('2 strokes');

    await dispatchTwoFingerStroke(player);
    await expect(player.locator('.draw-status')).toHaveText('3 strokes');

    await dispatchDenseStroke(player);
    await expect(player.locator('.draw-status')).toHaveText('4 strokes');
    await player.getByRole('button', { name: 'Submit Drawing' }).click();

    await expect(tv.getByText('The real prompt was')).toBeVisible();
    await expect(player.locator('.player-result-companion')).toContainText('Look up at the TV for the reveal');
    const tvContinue = tv.getByRole('button', {
      name: 'Continue from TV (fallback)',
      exact: true
    });
    await expect(tvContinue).toBeEnabled({ timeout: 8000 });
    await tvContinue.click();
    await expect(tv.locator('.scores-panel .panel-title')).toHaveText('Practice complete');
    await expect(player.locator('.scores-panel .panel-title')).toHaveText('Practice complete');
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

    const players = await createPlayers(
      browser,
      contexts,
      appUrl,
      roomCode,
      ['Ava', 'Bo', 'Cy'],
      [
        { width: 375, height: 667, isMobile: true },
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true }
      ]
    );
    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expect(tv.getByText('What did they draw?')).toBeVisible();
    const guessers = await waitForPagesWithVisibleLocatorCount(players, 'input[placeholder="Something that sounds legit…"]', 2);
    for (const [index, guesser] of guessers.entries()) {
      await guesser.getByPlaceholder('Something that sounds legit…').fill(`fake vote ${index}`);
      await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
    }

    await expect(tv.getByText('Which title is real?')).toBeVisible();
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
    await startParty(players[0]);
    await expect(tv.getByText('Phones are drawing')).toBeVisible();

    await drawStroke(players[0]);
    await players[0].getByRole('button', { name: 'Submit Drawing' }).click();
    await expectProgressSummary(tv, 'Drawings', '1/3', ['Ava', 'drawing in'], ['Bo', 'waiting'], ['Cy', 'waiting']);
    await expectNoVerticalOverflow(tv);

    for (const player of players.slice(1)) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expect(tv.getByText('What did they draw?')).toBeVisible();
    const guessers = await waitForPagesWithVisibleLocatorCount(players, 'input[placeholder="Something that sounds legit…"]', 2);
    const artist = players.find((player) => !guessers.includes(player));
    const firstGuesserName = nameForPage.get(guessers[0]) ?? '';
    const secondGuesserName = nameForPage.get(guessers[1]) ?? '';
    const artistName = artist ? (nameForPage.get(artist) ?? '') : '';

    await guessers[0].getByPlaceholder('Something that sounds legit…').fill('first fake');
    await guessers[0].getByRole('button', { name: 'Submit Fake Title' }).click();
    await expectProgressSummary(
      tv,
      'Fake titles',
      '1/2',
      [firstGuesserName, 'guess in'],
      [secondGuesserName, 'waiting'],
      [artistName, 'artist']
    );
    await expectNoVerticalOverflow(tv);

    await guessers[1].getByPlaceholder('Something that sounds legit…').fill('second fake');
    await guessers[1].getByRole('button', { name: 'Submit Fake Title' }).click();

    await expect(tv.getByText('Which title is real?')).toBeVisible();
    const voters = await waitForPagesWithVisibleLocatorCount(players, 'button.vote-option:not([disabled])', 2);
    const firstVoterName = nameForPage.get(voters[0]) ?? '';
    const secondVoterName = nameForPage.get(voters[1]) ?? '';
    const voteArtist = players.find((player) => !voters.includes(player));
    const voteArtistName = voteArtist ? (nameForPage.get(voteArtist) ?? '') : '';

    await expectMinimumTouchTarget(voters[0].locator('button.vote-option:not([disabled])').first());
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
  const playerViewports: PlayerViewport[] = [
    { width: 375, height: 667, isMobile: true },
    { width: 390, height: 844, isMobile: true },
    { width: 768, height: 1024, isMobile: false }
  ];

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const players = await createPlayers(
      browser,
      contexts,
      appUrl,
      roomCode,
      ['Ava', 'Bo', 'Cy'],
      playerViewports
    );
    await hostSaveRounds(players[0], '1');

    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    for (let turn = 0; turn < players.length; turn += 1) {
      await expect(tv.getByText('What did they draw?')).toBeVisible();
      const guessers = await waitForGuessers(players);
      for (const [index, guesser] of guessers.entries()) {
        await guesser.getByPlaceholder('Something that sounds legit…').fill(`fake finale ${turn} ${index}`);
        await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
      }

      await expect(tv.getByText('Which title is real?')).toBeVisible();
      const voters = await waitForPagesWithVisibleLocatorCount(
        players,
        'button.vote-option:not([disabled])',
        players.length - 1
      );
      for (const voter of voters) {
        await voter.locator('button.vote-option:not([disabled])').first().click();
      }

      await expect(tv.getByText('The real prompt was')).toBeVisible();
      const tvContinue = tv.getByRole('button', {
        name: 'Continue from TV (fallback)',
        exact: true
      });
      await expect(tvContinue).toBeEnabled({ timeout: 9000 });
      await tvContinue.click();
    }

    await expect(tv.getByText('Final Podium')).toBeVisible();
    const tvReplay = tv.locator('#advance-button');
    const hostReplay = players[0].locator('.encore-panel .spotlight-button');
    await expect(tvReplay).toBeVisible();
    await expect(tvReplay).toBeDisabled();
    await expect(tvReplay).toHaveText('Podium first…');
    await expect(hostReplay).toBeVisible();
    await expect(hostReplay).toBeDisabled();
    await expect(hostReplay).toHaveText('Podium first…');
    await expect(tv.locator('.encore-title')).toHaveText(/won by|take it back|tied|settle it/i);
    const hostScoresBox = await players[0].locator('.scores-panel').boundingBox();
    const hostReplayBox = await hostReplay.boundingBox();
    if (!hostScoresBox || !hostReplayBox) throw new Error('Finale panels must have layout boxes.');
    expect(hostScoresBox.y).toBeLessThan(hostReplayBox.y);
    expect(hostReplayBox.y + hostReplayBox.height).toBeLessThanOrEqual(667);
    await expect(hostReplay).toBeEnabled({ timeout: 5000 });
    await expect(hostReplay).toHaveText('Play Again');
    await expect(tvReplay).toBeEnabled();
    await expect(tvReplay).toHaveText('Play Again from TV (fallback)');
    await expect(tvReplay).toHaveClass(/btn--ghost/);
    for (const player of players.slice(1)) {
      await expect(player.locator('.advance-panel')).toContainText('Host decides.');
    }
    const tvShare = tv.getByRole('button', { name: /^(Share|Download) Podium from TV \(fallback\)$/ });
    await expect(tvShare).toBeVisible();
    await expect(tvShare).toHaveClass(/btn--ghost/);
    await expect(tv.locator('.podium-place')).toHaveCount(3);
    const titles = await tv.locator('.podium-title').allTextContents();
    expect(titles.every((title) => ['Champion', 'Runner-up', 'Third Place'].includes(title))).toBe(true);
    await expect(tv.locator('.score-row')).toHaveCount(0);

    const scoresPanel = await tv.locator('.scores-panel').boundingBox();
    if (!scoresPanel) {
      throw new Error('Scores panel must have a layout box.');
    }
    await expectNoVerticalOverflow(tv);
    expect(scoresPanel.y).toBeGreaterThanOrEqual(0);

    for (const [index, player] of players.entries()) {
      await expect(player.locator('.scores-panel')).toBeVisible();
      await expect(player.locator('.winner-callout')).toBeVisible();
      await expect(player.locator('.podium-place')).toHaveCount(3);
      await expect(player.getByRole('button', { name: /^(Share|Download) Podium$/ })).toBeVisible();
      await expectMinimumTouchTarget(player.getByRole('button', { name: /Podium/ }));
      await expectNoHorizontalOverflow(player);
      const playerScoresPanel = await player.locator('.scores-panel').boundingBox();
      if (!playerScoresPanel) {
        throw new Error('Player scores panel must have a layout box.');
      }
      expect(playerScoresPanel.y + playerScoresPanel.height).toBeLessThanOrEqual(
        playerViewports[index]?.height ?? 844
      );
    }

    await hostReplay.click();
    await expect(tv.getByText('Phones are drawing')).toBeVisible();
    await expect(players[0].locator('canvas.draw-canvas')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

async function expectMinimumTouchTarget(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Interactive control must have a layout box.');
  }
  expect(box.width).toBeGreaterThanOrEqual(52);
  expect(box.height).toBeGreaterThanOrEqual(52);
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

async function pagesWithVisibleLocator(pages: Page[], selector: string): Promise<Page[]> {
  const matches: Page[] = [];
  for (const page of pages) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) {
      matches.push(page);
    }
  }
  return matches;
}
