import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import {
  canvasHasInkNear,
  completeCurrentReveal,
  createPlayers,
  collectDrawingPrompts,
  drawTopLeftLandmark,
  drawStroke,
  expectTvDrawingStage,
  expectTvGuessingStage,
  expectTvVotingStage,
  expectUniformVoteLetterHeights,
  expectWithinViewportHeight,
  hostSaveRounds,
  installControllableVisualViewport,
  makeAppUrl,
  parseDeadlineLabel,
  setVisualViewportHeight,
  startParty,
  startPractice,
  waitForArtistIndex,
  waitForGuessers,
  waitForPagesWithVisibleLocatorCount,
  voteForRealPrompt,
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
    await expect(tv.locator('.results-panel')).toBeVisible();
    await expect(tv.locator('#advance-button')).toHaveCount(0);
    await expect(player.getByRole('button', { name: 'Continue' })).toHaveCount(0);
    await expect(tv.locator('#advance-button')).toBeEnabled({ timeout: 18000 });
    await expect(player.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await expect(player.locator('#deadline-text')).toHaveCount(0);
    await expect(tv.locator('#deadline-text')).toBeVisible();
    await expect(tv.locator('.results-panel')).toHaveAttribute('data-reveal-stage', 'complete');
    const tvContinue = tv.getByRole('button', {
      name: 'Continue from TV (fallback)',
      exact: true
    });
    await expect(tvContinue).toBeVisible();
    await expect(tvContinue).toHaveText('');
    await expect(tvContinue).toHaveClass(/tv-icon-fallback/);
    await expect(tvContinue).toHaveClass(/btn--ghost/);
    const continueBox = await tvContinue.boundingBox();
    if (!continueBox) {
      throw new Error('TV Continue must have a layout box.');
    }
    expect(continueBox.width).toBeLessThanOrEqual(56);
    expect(continueBox.height).toBeGreaterThanOrEqual(52);
    await expect(tv.locator('.result-advance')).not.toContainText('Use the host phone');
    await expect(tv.getByText('Next drawing in')).toHaveCount(0);
    const punchlineRank = await tv.evaluate(() => {
      const scoreLine = document.querySelector('.show-scores .round-outcome');
      const continueButton = document.querySelector('#advance-button');
      if (!scoreLine || !continueButton) {
        throw new Error('Score beat and Continue must be on the TV.');
      }
      return {
        score: parseFloat(getComputedStyle(scoreLine).fontSize),
        continueButton: parseFloat(getComputedStyle(continueButton).fontSize)
      };
    });
    expect(punchlineRank.score).toBeGreaterThan(punchlineRank.continueButton);
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
    await expect(phone.getByText('Type the code')).toBeVisible();
    await expect(phone.getByText('Jump into the party')).toHaveCount(0);
    await expect(phone.getByText(/Type the 4-letter/)).toHaveCount(0);
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

    await expect(phone.locator('.player-join-card .eyebrow')).toHaveText(roomCode);
    await expect(phone.locator('.player-room-chip')).toHaveCount(0);
    await expect(phone.locator('input.code-input')).toHaveCount(0);
    await expect(phone.getByText('Room found')).toHaveCount(0);
    await expect(phone.getByPlaceholder('Your name')).toBeFocused();
    await expect(phone.getByText(/Join before kickoff/)).toHaveCount(0);
    await expect(phone.getByText(/Name yourself/)).toHaveCount(0);
    await expect(phone.getByText(/TV is waiting/)).toHaveCount(0);
    const joinParty = phone.getByRole('button', { name: 'Join the Party' });
    const changeRoom = phone.getByRole('button', { name: 'Change room' });
    await expect(joinParty).toHaveClass(/btn--primary/);
    await expect(joinParty).toHaveClass(/btn--wide/);
    await expect(changeRoom).toHaveClass(/btn--ghost/);
    await expect(changeRoom).not.toHaveClass(/btn--wide/);
    await expect(changeRoom).not.toHaveClass(/btn--secondary/);
    const joinBox = await joinParty.boundingBox();
    const changeBox = await changeRoom.boundingBox();
    if (!joinBox || !changeBox) {
      throw new Error('Join and Change room must have layout boxes.');
    }
    expect(joinBox.width).toBeGreaterThan(changeBox.width);
    expect(joinBox.height).toBeGreaterThanOrEqual(changeBox.height);
    await changeRoom.click();
    await expect(phone).toHaveURL(/\/join$/);
    await expect(phone.locator('input.code-input')).toBeVisible();
    await expect(phone.getByText('Type the code')).toBeVisible();

    await phone.goto(appUrl(`/join/${roomCode}`));
    await phone.getByPlaceholder('Your name').fill('QR Quinn');
    await phone.getByRole('button', { name: 'Join the Party' }).click();
    await expect(phone.locator('.app-shell.player .brand')).toHaveText('Lobby');
    await expect(phone.getByText('Almost in')).toHaveCount(0);
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
    await expect(page.getByRole('button', { name: 'Start from TV (fallback)' })).toHaveCount(0);
    await expect(page.getByText('Everybody draws. Everybody guesses.')).toBeVisible();
    await expect(page.getByText('Scan to play')).toHaveCount(0);
    await expect(page.getByText('Join on a phone, then look back here.')).toHaveCount(0);
    await expect(page.locator('.room-code-label')).toHaveCount(0);
    await expect(page.locator('.room-code-wrap')).toHaveAttribute('aria-label', /Room Code/);
    await expect(page.getByText('This party', { exact: true })).toHaveCount(0);
    await expect(page.locator('.settings-summary-panel')).toHaveCount(0);
    await expect(page.locator('.settings-summary')).toHaveCount(0);
    await expect(page.getByText('Pace', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Pack', { exact: true })).toHaveCount(0);
    await expect(page.locator('.room-panel .start-note')).toHaveCount(0);
    await expect(page.locator('.players-panel .panel-title')).toHaveCount(0);
    await expect(page.locator('.players-panel')).toHaveAttribute('aria-label', 'Players');
    await expect(page.locator('.players-panel .start-note')).toHaveText(/Need \d+\+ phones\./);
    await expect(page.locator('.start-note')).not.toContainText('Scan the QR');
    await expect(page.locator('.empty-state')).not.toContainText('Waiting for phones');
    await expect(page.getByText('host controller')).toHaveCount(0);
    await expect(page.getByText('host phone')).toHaveCount(0);
    await expect(page.locator('.settings-panel')).toHaveCount(0);
    const tvSound = page.getByRole('button', { name: /^Game audio:/ });
    await expect(tvSound).toBeVisible();
    await expect(tvSound).toHaveText('');
    const roomCode = (await page.locator('.room-code').innerText()).trim();
    await expect(page.locator('.manual-join')).toContainText('/join');
    await expect(page.locator('.manual-join')).not.toContainText(roomCode);
    await expect(page.locator('.manual-join')).not.toContainText('Can’t scan');
    await expect(page.locator('.manual-join')).toHaveAttribute('aria-label', /Can’t scan\?/);
    const joinRank = await page.evaluate(() => {
      const roomCode = document.querySelector('.room-code');
      const pitch = document.querySelector('.room-hero-copy h2');
      const url = document.querySelector('.manual-join-url');
      if (!roomCode || !pitch || !url) {
        throw new Error('TV join hierarchy must include code, pitch, and URL.');
      }
      return {
        code: parseFloat(getComputedStyle(roomCode).fontSize),
        pitch: parseFloat(getComputedStyle(pitch).fontSize),
        url: parseFloat(getComputedStyle(url).fontSize)
      };
    });
    expect(joinRank.url).toBeGreaterThanOrEqual(14);
    expect(joinRank.code).toBeGreaterThan(joinRank.url * 2);
    expect(joinRank.pitch).toBeGreaterThan(joinRank.url);
    const urlColor = await page.locator('.manual-join-url').evaluate((element) => getComputedStyle(element).color);
    expect(urlColor).not.toMatch(/100,\s*181,\s*255/);
    const pitchColor = await page.locator('.room-hero-copy h2').evaluate((element) => getComputedStyle(element).color);
    expect(urlColor).not.toBe(pitchColor);
    const pitchLayout = await page.locator('.room-hero-copy h2').evaluate((heading) => {
      const box = heading.getBoundingClientRect();
      const lineRects = Array.from(heading.getClientRects());
      const textNode = heading.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        throw new Error('Lobby pitch must be plain text.');
      }
      const text = textNode.textContent ?? '';
      const gIndex = text.lastIndexOf('g');
      const range = document.createRange();
      range.setStart(textNode, gIndex);
      range.setEnd(textNode, gIndex + 1);
      const gRect = range.getBoundingClientRect();
      return {
        lineCount: lineRects.length,
        overflowPx: heading.scrollHeight - heading.clientHeight,
        descenderGap: box.bottom - gRect.bottom
      };
    });
    expect(pitchLayout.lineCount).toBeLessThanOrEqual(3);
    expect(pitchLayout.overflowPx).toBeLessThanOrEqual(1);
    expect(pitchLayout.descenderGap).toBeGreaterThanOrEqual(1);
    await expectNoVerticalOverflow(page);

    const roomPanel = await page.locator('.room-panel').boundingBox();
    const playersPanel = await page.locator('.players-panel').boundingBox();
    const qr = await page.locator('.qr').boundingBox();
    if (!roomPanel || !playersPanel || !qr) {
      throw new Error('TV lobby panels must have layout boxes.');
    }
    expect(roomPanel.width).toBeGreaterThan(360);
    expect(qr.y + qr.height).toBeLessThanOrEqual(viewport.height);
    expect(qr.width).toBeGreaterThanOrEqual(200);
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
    await expect(ava.locator('.topbar')).toBeHidden();
    await expect(tv.locator('.topbar')).toBeHidden();
    await expect(ava.locator('.mini-room-code')).toHaveText(roomCode);
    await expect(ava.getByRole('button', { name: 'Edit name' })).toHaveText('Ava');
    await expectMinimumTouchTarget(ava.getByRole('button', { name: 'Edit name' }));
    await expectMinimumTouchTarget(ava.locator('.settings-preset').first());
    await expect(ava.locator('.settings-advanced')).toHaveCount(0);
    await expect(ava.getByText('Room Settings')).toHaveCount(0);
    await expect(ava.getByRole('button', { name: 'Start Party' })).toBeDisabled();
    await expect(ava.getByRole('button', { name: 'Practice Drawing' })).toBeEnabled();
    await expect(ava.getByText('Waiting for players')).toHaveCount(0);
    await expect(ava.getByRole('button', { name: /Turn alerts (on|off)/ })).toHaveText('');
    const [bo] = await createPlayers(browser, contexts, appUrl, roomCode, ['Bo'], [
      { width: 430, height: 932, isMobile: true }
    ]);
    await expect(ava.getByRole('button', { name: 'Practice Drawing' })).toHaveCount(0);
    await expect(ava.getByText(/1 more|one more/i)).toBeVisible();
    await expect(bo.getByText(/1 more|one more/i)).toHaveCount(0);
    await expect(bo.getByText('Watch the TV.')).toBeVisible();
    await expect(ava.getByRole('button', { name: 'Edit name' })).toBeVisible();
    await expect(ava.locator('.players-panel')).toHaveCount(0);
    await expect(bo.locator('.players-panel')).toHaveCount(0);
    await expect(bo.locator('.player-lobby-card')).toBeVisible();
    await expect(tv.getByRole('button', { name: 'Start from TV (fallback)' })).toHaveCount(0);
    await expectNoHorizontalOverflow(ava);

    const [cy] = await createPlayers(browser, contexts, appUrl, roomCode, ['Cy'], [
      { width: 430, height: 932, isMobile: true }
    ]);
    await expect(ava.getByRole('button', { name: 'Start Party' })).toBeEnabled();
    await expect(bo.getByText('Party is ready')).toHaveCount(0);
    await expect(cy.getByText('Party is ready')).toHaveCount(0);
    await expect(bo.getByText('Watch the TV.')).toBeVisible();
    await expect(cy.getByText('Watch the TV.')).toBeVisible();
    await expect(bo.locator('.player-room-chip')).toHaveCount(0);
    await expect(cy.locator('.player-room-chip')).toHaveCount(0);
    await expect(ava.getByText('The host phone can start the game.')).toHaveCount(0);
    await expect(tv.getByRole('button', { name: 'Start from TV (fallback)' })).toBeEnabled();
    await expect(tv.getByRole('button', { name: 'Start from TV (fallback)' })).toHaveText('');
    await expect(tv.locator('.settings-summary-panel')).toHaveCount(0);
    await expect(tv.getByText('Start Party')).toHaveCount(0);

    await ava.getByRole('button', { name: 'Edit name' }).click();
    await ava.getByLabel('Your name').fill('Ava Renamed');
    await ava.getByRole('button', { name: 'Save name' }).click();
    await expect(ava.getByRole('button', { name: 'Edit name' })).toHaveText('Ava Renamed');
    await expect(ava.getByText(/you're the host|you're in/i)).toHaveCount(0);
    await expect(ava.locator('.ready-count')).toHaveCount(0);
    await expect(tv.locator('.player-name-text', { hasText: /^Ava Renamed$/ })).toHaveText('Ava Renamed');

    const lobbyBox = await ava.locator('.player-lobby-card').boundingBox();
    const settingsBox = await ava.locator('.settings-panel').boundingBox();
    if (!lobbyBox || !settingsBox) {
      throw new Error('Large-phone lobby panels must have layout boxes.');
    }
    expect(lobbyBox.y + lobbyBox.height).toBeLessThan(settingsBox.y);
    expect(settingsBox.width).toBeLessThanOrEqual(430);
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
    await expect(ava.getByRole('button', { name: 'Submit Drawing' })).toHaveCount(0);
    await expect(ava.getByText('Draw first')).toHaveCount(0);
    await expect(ava.locator('#prompt-text')).not.toContainText(/^Draw:/);
    await expect(ava.locator('#prompt-text')).not.toHaveText('Waiting for prompt...');
    await expect(ava.locator('.turn-copy .eyebrow')).toHaveCount(0);
    await expect(tv.getByText(/Round \d+ of \d+/)).toBeVisible();
    await expect(ava.locator('.action-hint')).toHaveCount(0);
    const typeRank = await ava.evaluate(() => {
      const prompt = document.querySelector('#prompt-text');
      const deadline = document.querySelector('#deadline-text');
      if (!prompt || !deadline) {
        throw new Error('Drawing prompt and deadline must be on screen.');
      }
      return {
        prompt: parseFloat(getComputedStyle(prompt).fontSize),
        deadline: parseFloat(getComputedStyle(deadline).fontSize)
      };
    });
    expect(typeRank.prompt).toBeGreaterThanOrEqual(typeRank.deadline);
    const promptWidth = await ava.evaluate(() => {
      const prompt = document.querySelector('#prompt-text');
      const header = document.querySelector('.turn-header');
      if (!prompt || !header) {
        throw new Error('Drawing prompt and header must be on screen.');
      }
      return {
        prompt: prompt.getBoundingClientRect().width,
        header: header.getBoundingClientRect().width
      };
    });
    expect(promptWidth.prompt).toBeGreaterThan(promptWidth.header * 0.9);
    await expect(ava.locator('#deadline-text')).toHaveText(/\d+:\d{2}/);
    await expect(ava.locator('.tools-summary')).toHaveAttribute(
      'aria-label',
      'Open drawing tools, black, 6px'
    );
    await expect(ava.locator('.drawing-tools-slot .tools-drawer')).toBeVisible();
    await expect(ava.locator('.tools-summary')).not.toContainText('Tools');
    await expect(ava.locator('.draw-toolbar')).toBeHidden();
    await expect(bo.locator('canvas.draw-canvas')).toBeVisible();
    await expectMinimumTouchTarget(ava.locator('.tools-summary'));

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

    const stageBox = await ava.locator('.canvas-stage').boundingBox();
    const drawerBox = await ava.locator('.tools-drawer').boundingBox();
    if (!stageBox || !drawerBox) {
      throw new Error('Drawing canvas and tools drawer must have layout boxes.');
    }
    expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(stageBox.y + 2);
    expect(stageBox.width).toBeGreaterThan(340);

    await drawStroke(ava);
    await expect(ava.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
    await expect(ava.getByRole('button', { name: 'Submit Drawing' })).toHaveText('Submit Drawing');
    await expectMinimumTouchTarget(ava.getByRole('button', { name: 'Submit Drawing' }));
    const submitBox = await ava.getByRole('button', { name: 'Submit Drawing' }).boundingBox();
    if (!submitBox) {
      throw new Error('Submit Drawing must have a layout box after ink.');
    }
    expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(844);
    await expect(ava.locator('.submit-help')).toHaveCount(0);
    await ava.locator('.tools-summary').click();
    await expect(ava.locator('.draw-toolbar')).toBeVisible();
    await expectMinimumTouchTarget(ava.locator('.swatch').nth(1));
    await expectMinimumTouchTarget(ava.getByRole('button', { name: 'Clear drawing' }));
    await ava.locator('.swatch').nth(1).click();
    await expect(ava.locator('.swatch').nth(1)).toHaveClass(/is-selected/);
    await expect(ava.locator('.tools-summary')).toHaveAttribute(
      'aria-label',
      'Open drawing tools, red, 6px'
    );
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
      await expect(page.locator('#prompt-text')).not.toContainText(/^Draw:/);
      await expect(page.locator('#prompt-text')).not.toHaveText('Waiting for prompt...');
      await expectNoHorizontalOverflow(page);
    }

    const portraitCanvas = await portrait.locator('canvas.draw-canvas').boundingBox();
    const landscapeCanvas = await landscape.locator('canvas.draw-canvas').boundingBox();
    if (!portraitCanvas || !landscapeCanvas) {
      throw new Error('iPad drawing canvases must have layout boxes.');
    }
    expect(portraitCanvas.width).toBeGreaterThan(480);
    expect(landscapeCanvas.width).toBeGreaterThan(620);
    await expect(portrait.locator('.submit-help')).toHaveCount(0);
    await expect(portrait.getByRole('button', { name: 'Submit Drawing' })).toHaveCount(0);
    await drawStroke(portrait);
    await drawStroke(landscape);

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
      await expectTvGuessingStage(tv);
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

    await expect(tv.locator('.reveal-prompt')).toBeVisible();
    await expect(player.locator('.topbar')).toBeHidden();
    await expect(player.locator('.player-result-companion h2')).toHaveText('Look up');
    await expect(player.locator('.player-result-companion')).not.toContainText('Reveal time');
    await expect(player.locator('.player-result-companion')).not.toContainText('Practice · scores off');
    await expect(player.locator('.personal-score')).toHaveCount(0);
    await expect(player.locator('.player-result-companion .reaction-bar')).toHaveCount(0);
    await expect(player.locator('.result-phone-advance')).not.toContainText('Or wait');
    await expect(player.locator('.result-phone-advance #deadline-text')).toHaveCount(0);
    const tvContinue = tv.getByRole('button', {
      name: 'Continue from TV (fallback)',
      exact: true
    });
    await expect(tvContinue).toBeEnabled({ timeout: 8000 });
    await tvContinue.click();
    await expect(tv.locator('.winner-callout h2')).toHaveText('Warm-up complete');
    await expect(player.locator('.winner-callout h2')).toHaveText('Warm-up complete');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('party reveal shows personal score on phones after the TV punchline', async ({ baseURL, browser }) => {
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
      ['Ava', 'Bo', 'Cy'],
      [
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true }
      ]
    );
    await startParty(players[0]);
    const prompts = await collectDrawingPrompts(players);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
    const artistIndex = await waitForArtistIndex(players);
    const prompt = prompts[artistIndex] ?? '';
    expect(prompt.length).toBeGreaterThan(0);
    const guessers = await waitForGuessers(players);
    for (const [index, guesser] of guessers.entries()) {
      await guesser.getByPlaceholder('Something that sounds legit…').fill(`score-check-${index}`);
      await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
    }

    await expectTvVotingStage(tv);
    const voters = await waitForPagesWithVisibleLocatorCount(
      players,
      'button.vote-option:not([disabled])',
      Math.max(0, players.length - 1)
    );
    expect(voters.length).toBeGreaterThan(0);
    const scorer = voters[0];
    await voteForRealPrompt(scorer, prompt);
    for (const voter of voters.slice(1)) {
      await voter.locator('button.vote-option:not([disabled])').first().click();
    }

    await expect(tv.locator('.results-panel.display-results')).toHaveAttribute('data-reveal-stage', 'complete', {
      timeout: 12_000
    });
    await expect(scorer.locator('.personal-score')).toBeVisible();
    await expect(scorer.locator('.personal-score')).toContainText('+');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('party host can add 30 seconds during drawing', async ({ baseURL, browser }) => {
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
      ['Ava', 'Bo', 'Cy'],
      [
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true }
      ]
    );
    const host = players[0];
    await startParty(host);
    await expectTvDrawingStage(tv);
    for (const player of players) {
      await expect(player.locator('canvas.draw-canvas')).toBeVisible();
    }

    await expect(host.getByRole('button', { name: '+30 seconds' })).toBeVisible();
    await expect(players[1].getByRole('button', { name: '+30 seconds' })).toHaveCount(0);
    await expect(players[2].getByRole('button', { name: '+30 seconds' })).toHaveCount(0);

    const deadlineBefore = await host.locator('#deadline-text span').first().innerText();
    const deadlineBeforeSeconds = parseDeadlineLabel(deadlineBefore);
    await host.getByRole('button', { name: '+30 seconds' }).click();
    await expect(host.getByRole('button', { name: 'Adding 30 seconds' })).toBeVisible();
    await expect.poll(async () => host.getByRole('button', { name: '+30 seconds' }).count()).toBe(0);
    await expect
      .poll(async () =>
        parseDeadlineLabel(await host.locator('#deadline-text span').first().innerText())
      )
      .toBeGreaterThanOrEqual(deadlineBeforeSeconds + 25);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('party host keeps +30 seconds after locking a fake title', async ({ baseURL, browser }) => {
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
      ['Ava', 'Bo', 'Cy', 'Dee'],
      [
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true }
      ]
    );
    const host = players[0];
    await startParty(host);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    let hostChecked = false;
    for (let reveal = 0; reveal < players.length; reveal += 1) {
      await expectTvGuessingStage(tv);
      const guessers = await waitForGuessers(players);
      if (!guessers.includes(host)) {
        await completeCurrentReveal(tv, players, `host-guess-extend-skip-${reveal}`);
        continue;
      }

      await host.getByPlaceholder('Something that sounds legit…').fill('host slow room');
      await host.getByRole('button', { name: 'Submit Fake Title' }).click();
      await expect(host.locator('.submission-state.is-accepted')).toHaveText('Watch the TV.');
      await expect(host.getByRole('button', { name: '+30 seconds' })).toBeVisible();
      await expect(tv.locator('#deadline-text')).toBeVisible();
      const tvDeadlineBefore = parseDeadlineLabel(
        await tv.locator('#deadline-text span').first().innerText()
      );
      await host.getByRole('button', { name: '+30 seconds' }).click();
      await expect
        .poll(async () =>
          parseDeadlineLabel(await tv.locator('#deadline-text span').first().innerText())
        )
        .toBeGreaterThanOrEqual(tvDeadlineBefore + 25);
      hostChecked = true;
      break;
    }

    expect(hostChecked, 'Host must act as a guesser in a four-phone party').toBe(true);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('party host keeps +30 seconds after locking a vote', async ({ baseURL, browser }) => {
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
      ['Ava', 'Bo', 'Cy', 'Dee'],
      [
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true },
        { width: 390, height: 844, isMobile: true }
      ]
    );
    const host = players[0];
    await startParty(host);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    let hostChecked = false;
    for (let reveal = 0; reveal < players.length; reveal += 1) {
      await expectTvGuessingStage(tv);
      const guessers = await waitForGuessers(players);
      for (const [index, guesser] of guessers.entries()) {
        await guesser.getByPlaceholder('Something that sounds legit…').fill(`vote-host-${index}`);
        await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
      }

      await expectTvVotingStage(tv);
      const voters = await waitForPagesWithVisibleLocatorCount(
        players,
        'button.vote-option:not([disabled])',
        Math.max(0, players.length - 1)
      );
      if (!voters.includes(host)) {
        for (const voter of voters) {
          await voter.locator('button.vote-option:not([disabled])').first().click();
        }
        await expect(tv.locator('.results-panel.display-results')).toBeVisible();
        await expect(tv.locator('.results-panel.display-results')).toHaveAttribute('data-reveal-stage', 'complete', {
          timeout: 12_000
        });
        const tvContinue = tv.getByRole('button', {
          name: 'Continue from TV (fallback)',
          exact: true
        });
        await expect(tvContinue).toBeEnabled({ timeout: 12_000 });
        await tvContinue.click();
        continue;
      }

      await host.locator('button.vote-option:not([disabled])').first().click();
      await expect(host.locator('.submission-state.is-accepted')).toHaveText('Watch the TV.');
      await expect(host.getByRole('button', { name: '+30 seconds' })).toBeVisible();
      await expect(tv.locator('#deadline-text')).toBeVisible();
      const tvDeadlineBefore = parseDeadlineLabel(
        await tv.locator('#deadline-text span').first().innerText()
      );
      await host.getByRole('button', { name: '+30 seconds' }).click();
      await expect
        .poll(async () =>
          parseDeadlineLabel(await tv.locator('#deadline-text span').first().innerText())
        )
        .toBeGreaterThanOrEqual(tvDeadlineBefore + 25);
      hostChecked = true;
      break;
    }

    expect(hostChecked, 'Host must act as a voter in a four-phone party').toBe(true);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('fake title submit stays above a simulated on-screen keyboard on iPhone SE', async ({
  baseURL,
  browser
}) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);
  const seViewport = { width: 375, height: 667, isMobile: true };

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
      ['Ava', 'Bo', 'Cy'],
      [seViewport, seViewport, seViewport],
      async (context) => {
        await installControllableVisualViewport(context);
      }
    );
    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
    const [guesser] = await waitForGuessers(players);
    const titleField = guesser.getByPlaceholder('Something that sounds legit…');
    await expect(titleField).toBeFocused();
    await titleField.fill('keyboard couch test');
    await setVisualViewportHeight(guesser, 400);
    await expect(guesser.getByRole('button', { name: 'Submit Fake Title' })).toBeEnabled();
    await expectWithinViewportHeight(
      guesser,
      'button:has-text("Submit Fake Title")',
      seViewport.height
    );
    await expectWithinViewportHeight(guesser, 'input[placeholder="Something that sounds legit…"]', seViewport.height);
    await expect
      .poll(async () =>
        guesser.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset'))
      )
      .toBe('267px');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('join keeps Join the Party above a simulated on-screen keyboard on iPhone SE', async ({
  baseURL,
  browser
}) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);
  const seViewport = { width: 375, height: 667, isMobile: true };

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const joinContext = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: seViewport
    });
    contexts.push(joinContext);
    await installControllableVisualViewport(joinContext);
    const joiner = await joinContext.newPage();
    await joiner.goto(appUrl(`/join/${roomCode}`));
    await joiner.getByPlaceholder('Your name').click();
    await setVisualViewportHeight(joiner, 400);
    await expectWithinViewportHeight(joiner, 'button:has-text("Join the Party")', seViewport.height);
    await expectWithinViewportHeight(joiner, 'input[placeholder="Your name"]', seViewport.height);
    await expect
      .poll(async () =>
        joiner.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset'))
      )
      .toBe('267px');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('a locked phone vote looks up instead of keeping the letter grid', async ({ baseURL, browser }) => {
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
        { width: 768, height: 1024, isMobile: false },
        { width: 390, height: 844, isMobile: true }
      ]
    );
    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
    await expect(tv.getByText('Title it on your phone.')).toHaveCount(0);
    const guessers = await waitForPagesWithVisibleLocatorCount(players, 'input[placeholder="Something that sounds legit…"]', 2);
    await expect(guessers[0].locator('.action-hint')).toHaveCount(0);
    await expect(guessers[0].locator('.field-label:not(.visually-hidden)')).toHaveCount(0);
    const titleField = guessers[0].getByPlaceholder('Something that sounds legit…');
    await expect(titleField).toBeFocused();
    const titleFieldBox = await titleField.boundingBox();
    if (!titleFieldBox) {
      throw new Error('Fake title field must have a layout box.');
    }
    expect(titleFieldBox.height).toBeGreaterThanOrEqual(64);
    const titleFieldSize = await titleField.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize)
    );
    expect(titleFieldSize).toBeGreaterThanOrEqual(22);
    await expect(guessers[0].getByText('Fool the room')).toHaveCount(0);
    await expect(guessers[0].locator('.topbar')).toBeHidden();
    await expect(guessers[0].locator('#deadline-text')).toHaveCount(0);
    const artistDuringGuess = players.find((player) => !guessers.includes(player));
    if (!artistDuringGuess) {
      throw new Error('Guessing artist must be on a phone.');
    }
    await expect(artistDuringGuess.getByText('Look up')).toBeVisible();
    await expect(artistDuringGuess.locator('#deadline-text')).toHaveCount(0);
    await expect(artistDuringGuess.locator('.reaction-bar')).toBeHidden();
    await expect(artistDuringGuess.locator('.phone-canvas')).toHaveCount(0);
    await expect(guessers[0].getByRole('button', { name: 'Submit Fake Title' })).toHaveCount(0);
    await expect(guessers[0].getByText('Write a title')).toHaveCount(0);
    for (const guesser of guessers) {
      await expect(guesser.locator('.phone-canvas')).toHaveCount(0);
      await expect(guesser.locator('.reaction-bar')).toBeHidden();
    }
    await guessers[0].getByPlaceholder('Something that sounds legit…').fill('fake vote 0');
    await expect(guessers[0].getByRole('button', { name: 'Submit Fake Title' })).toBeEnabled();
    await guessers[0].getByRole('button', { name: 'Submit Fake Title' }).click();
    await expect(guessers[0].locator('.submission-state.is-accepted')).toHaveText('Watch the TV.');
    await expect(guessers[0].locator('#deadline-text')).toHaveCount(0);
    await expect(guessers[0].locator('.reaction-bar')).toBeVisible();
    await guessers[1].getByPlaceholder('Something that sounds legit…').fill('fake vote 1');
    await expect(guessers[1].getByRole('button', { name: 'Submit Fake Title' })).toBeEnabled();
    await guessers[1].getByRole('button', { name: 'Submit Fake Title' }).click();

    await expectTvVotingStage(tv);
    await expect(tv.getByText('Tap the letter on your phone.')).toHaveCount(0);
    await expect(tv.getByText('On the phones')).toHaveCount(0);
    await expect(tv.locator('.display-grid-voting .reveal-canvas')).toHaveCount(0);
    const voteAnswerSize = await tv.locator('.display-grid-voting .vote-answer').first().evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize)
    );
    expect(voteAnswerSize).toBeGreaterThanOrEqual(22);
    await expectNoVerticalOverflow(tv);
    const voters = await waitForPagesWithVisibleLocatorCount(players, 'button.vote-option:not([disabled])', 2);
    const voter = voters[0];
    const voteArtist = players.find((player) => !voters.includes(player));
    if (!voteArtist) {
      throw new Error('Voting artist must be on a phone.');
    }
    await expect(voteArtist.getByText('Look up')).toBeVisible();
    await expect(voteArtist.locator('#deadline-text')).toHaveCount(0);
    await expect(voteArtist.locator('.reaction-bar')).toBeHidden();
    await expect(voteArtist.locator('.phone-canvas')).toHaveCount(0);
    await expect(voter.getByText('Which one is real?')).toHaveCount(0);
    await expect(voter.locator('#deadline-text')).toHaveCount(0);
    await expect(voter.getByRole('button', { name: /Your fake answer/ })).toBeDisabled();
    await expect(voter.getByText('Yours', { exact: true })).toBeVisible();
    await expectUniformVoteLetterHeights(voter);
    await expect(voter.locator('.topbar')).toBeHidden();
    await expect(voter.locator('.action-hint')).toHaveCount(0);
    for (const pendingVoter of voters) {
      await expect(pendingVoter.locator('.phone-canvas')).toHaveCount(0);
      await expect(pendingVoter.locator('.vote-answer').first()).toBeHidden();
      await expect(pendingVoter.locator('.option-label').first()).toBeVisible();
    }
    const voteLetterSize = await voter.locator('.option-label').first().evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize)
    );
    expect(voteLetterSize).toBeGreaterThanOrEqual(24);
    for (const pendingVoter of voters) {
      await expect(pendingVoter.locator('.reaction-bar')).toBeHidden();
    }
    await voter.locator('button.vote-option:not([disabled])').first().click();
    await expect(voter.locator('.submission-state.is-accepted')).toHaveText('Watch the TV.');
    await expect(voter.locator('.player-vote-list')).toHaveCount(0);
    await expect(voter.locator('#deadline-text')).toHaveCount(0);
    await expect(voter.locator('.reaction-bar')).toBeVisible();
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
    await expectTvDrawingStage(tv);
    await expect(tv.getByText('Draw on your phone. Look up when the titles start.')).toHaveCount(0);
    await expect(tv.locator('.hero-hint')).toHaveCount(0);

    await drawStroke(players[0]);
    await players[0].getByRole('button', { name: 'Submit Drawing' }).click();
    await expect(players[0].locator('.submission-state.is-accepted')).toHaveText('Watch the TV.');
    await expect(players[0].locator('#deadline-text')).toHaveCount(0);
    await expect(players[0].locator('#prompt-text')).toHaveCount(0);
    await expect(players[0].getByText('Look up')).toHaveCount(0);
    await expectProgressSummary(tv, 'Drawings', '1/3', ['Ava', 'in'], ['Bo', 'waiting'], ['Cy', 'waiting']);
    await expectNoVerticalOverflow(tv);

    for (const player of players.slice(1)) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
    await expect(tv.getByText('Title it on your phone.')).toHaveCount(0);
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
      [firstGuesserName, 'in'],
      [secondGuesserName, 'waiting'],
      [artistName, 'artist']
    );
    await expectNoVerticalOverflow(tv);

    await guessers[1].getByPlaceholder('Something that sounds legit…').fill('second fake');
    await guessers[1].getByRole('button', { name: 'Submit Fake Title' }).click();

    await expectTvVotingStage(tv);
    await expect(tv.getByText('Tap the letter on your phone.')).toHaveCount(0);
    await expect(tv.locator('.display-grid-voting .reveal-canvas')).toHaveCount(0);
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
      await expectTvGuessingStage(tv);
      const guessers = await waitForGuessers(players);
      for (const [index, guesser] of guessers.entries()) {
        await guesser.getByPlaceholder('Something that sounds legit…').fill(`fake finale ${turn} ${index}`);
        await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
      }

      await expectTvVotingStage(tv);
      const voters = await waitForPagesWithVisibleLocatorCount(
        players,
        'button.vote-option:not([disabled])',
        players.length - 1
      );
      for (const voter of voters) {
        await voter.locator('button.vote-option:not([disabled])').first().click();
      }

      await expect(tv.locator('.reveal-prompt')).toBeVisible();
      for (const player of players) {
        await expect(player.locator('.player-result-companion h2')).toHaveText('Look up');
        await expect(player.locator('.personal-score')).toHaveCount(0);
        await expect(player.getByText('No points this reveal.')).toHaveCount(0);
      }
      const tvContinue = tv.getByRole('button', {
        name: 'Continue from TV (fallback)',
        exact: true
      });
      await expect(tvContinue).toBeEnabled({ timeout: 9000 });
      await tvContinue.click();
    }

    await expect(tv.locator('.podium')).toBeVisible();
    await expect(tv.getByText('Final Podium')).toHaveCount(0);
    await expect(tv.getByText('Look up, then play again')).toHaveCount(0);
    await expect(tv.getByText('Podium first…')).toHaveCount(0);
    await expect(players[0].getByText('Podium first…')).toHaveCount(0);
    const tvReplay = tv.locator('#advance-button');
    const hostReplay = players[0].locator('.encore-panel .spotlight-button');
    const tvShare = tv.getByRole('button', { name: /^(Share|Download) Podium from TV \(fallback\)$/ });
    await expect(tvShare).toHaveCount(0);
    await expect(tvReplay).toHaveCount(0);
    await expect(tv.locator('.encore-title')).toHaveCount(0);
    await expect(tv.locator('.encore-panel')).toHaveCount(0);
    await expect(hostReplay).toBeEnabled({ timeout: 5000 });
    const hostScoresBox = await players[0].locator('.scores-panel').boundingBox();
    const hostReplayBox = await hostReplay.boundingBox();
    if (!hostScoresBox || !hostReplayBox) throw new Error('Finale panels must have layout boxes.');
    expect(hostScoresBox.y).toBeLessThan(hostReplayBox.y);
    expect(hostReplayBox.y + hostReplayBox.height).toBeLessThanOrEqual(667);
    await expect(hostReplay).toHaveText('Play Again');
    await expect(tvReplay).toBeEnabled();
    await expect(tvReplay).toHaveText('');
    await expect(tvReplay).toHaveClass(/tv-icon-fallback/);
    await expect(tvReplay).toHaveClass(/btn--ghost/);
    await expect(players[0].locator('.encore-panel')).not.toContainText('Host controls');
    await expect(players[0].locator('.encore-panel')).not.toContainText('connected phones');
    for (const player of players.slice(1)) {
      await expect(player.locator('.encore-panel')).toHaveCount(0);
      await expect(player.getByText('Host decides')).toHaveCount(0);
      await expect(player.locator('.scores-panel')).toBeVisible();
    }
    await expect(tvShare).toBeVisible();
    await expect(tvShare).toHaveText(/^(Share|Download) Podium$/);
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
      await expect(player.locator('.topbar')).toBeHidden();
      await expect(player.locator('.scores-panel')).toBeVisible();
      await expect(player.locator('.winner-callout')).toBeVisible();
      await expect(player.locator('.podium-place')).toHaveCount(3);
      await expect(player.getByRole('button', { name: /^(Share|Download) Podium$/ })).toHaveCount(0);
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
    await expectTvDrawingStage(tv);
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
  const panel = page.locator(`.progress-panel[aria-label="${title}"]`);
  await expect(panel).toBeVisible();
  await expect.poll(async () => panel.locator('.big-count').innerText()).toBe(count);
  await expect(panel.locator('.submission-list')).toHaveCount(0);
  const waiting = rows.filter(([, status]) => status === 'waiting').map(([name]) => name);
  if (waiting.length === 0) {
    await expect(panel.locator('p.muted')).toHaveCount(0);
    return;
  }
  const line = panel.locator('p.muted');
  await expect(line).toBeVisible();
  await expect(line).not.toContainText('Waiting on');
  const ariaLabel = await line.getAttribute('aria-label');
  expect(ariaLabel).toMatch(/^Waiting on /);
  for (const name of waiting) {
    expect(ariaLabel).toContain(name);
  }
  for (const name of waiting) {
    await expect(line).toContainText(name);
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
