import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  configureSubmissionHarness,
  createPlayers,
  drawStroke,
  expectTvDrawingStage,
  expectTvGuessingStage,
  expectTvVotingStage,
  expectWithinViewportHeight,
  hostSaveRounds,
  installSubmissionHarness,
  makeAppUrl,
  releaseDeferredSubmission,
  startParty,
  submissionSendCount,
  waitForGuessers,
  waitForPagesWithVisibleLocatorCount
} from './helpers';

const TURN_DRAFT_STORAGE_KEY = 'draw-party-turn-draft';
const PENDING_RENAME_STORAGE_KEY = 'draw-party-pending-rename';

async function turnDraftStored(page: Page): Promise<boolean> {
  return page.evaluate((key) => sessionStorage.getItem(key) !== null, TURN_DRAFT_STORAGE_KEY);
}

async function pendingRenameStored(page: Page): Promise<boolean> {
  return page.evaluate((key) => sessionStorage.getItem(key) !== null, PENDING_RENAME_STORAGE_KEY);
}

async function drawingCanvasHasInk(page: Page): Promise<boolean> {
  return page.locator('canvas.draw-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index]! < 240 || pixels[index + 1]! < 240 || pixels[index + 2]! < 240) {
        return true;
      }
    }
    return false;
  });
}

test('display refresh reattaches to the active game', async ({ baseURL, browser }) => {
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
    await startParty(players[0]);
    await expectTvDrawingStage(tv);
    await expect(players[0].locator('canvas.draw-canvas')).toBeVisible();

    await tv.reload();

    await expectTvDrawingStage(tv);
    await expect(players[0].locator('canvas.draw-canvas')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('a stale cached display room recovers into one fresh lobby', async ({ baseURL, browser }) => {
  const appUrl = makeAppUrl(baseURL);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  try {
    await context.addInitScript(() => {
      localStorage.setItem('draw-party-active-host-room', 'ZZZZ');
      localStorage.setItem('draw-party-host-token-ZZZZ', 'stale-token');
      const NativeWebSocket = window.WebSocket;
      let delayFirstClose = true;
      window.WebSocket = new Proxy(NativeWebSocket, {
        construct(target, args) {
          const socket = Reflect.construct(target, args) as WebSocket;
          if (delayFirstClose) {
            delayFirstClose = false;
            const close = socket.close.bind(socket);
            socket.close = ((code?: number, reason?: string) => {
              window.setTimeout(() => close(code, reason), 1000);
            }) as typeof socket.close;
          }
          return socket;
        }
      });
    });
    const tv = await context.newPage();
    await tv.goto(appUrl('/'));

    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/, { timeout: 10000 });
    await expect(tv.locator('.room-code')).not.toHaveText('ZZZZ');
    await expect(tv.getByText('Creating a fresh lobby…')).toHaveCount(0);
    await tv.waitForTimeout(1500);
    await expect(tv.locator('#connection-text')).toHaveText('Connected');
  } finally {
    await context.close();
  }
});

test('player refresh reclaims the same drawing seat automatically', async ({ baseURL, browser }) => {
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
    await startParty(players[0]);
    await expect(players[0].locator('canvas.draw-canvas')).toBeVisible();

    await players[0].reload();

    await expect(players[0].locator('canvas.draw-canvas')).toBeVisible();
    await expect(players[0].getByRole('button', { name: 'Join the Party' })).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('an unfinished drawing survives full refresh and clears only after acceptance', async ({
  baseURL,
  browser
}) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();
    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy']);
    const recovering = players[0];

    await startParty(recovering);
    await drawStroke(recovering);
    await expect(recovering.locator('.draw-status')).toHaveText('1 stroke');
    await expect.poll(() => turnDraftStored(recovering)).toBe(true);

    await recovering.reload();

    await expect(recovering.locator('.draw-status')).toHaveText('1 stroke');
    await expect.poll(() => drawingCanvasHasInk(recovering)).toBe(true);
    await expect(recovering.getByRole('button', { name: 'Submit Drawing' })).toBeEnabled();
    await expect(recovering.locator('.submission-state.is-pending')).toHaveCount(0);

    await recovering.getByLabel('Open drawing tools').click();
    await recovering.getByRole('button', { name: 'Undo last stroke' }).click();
    await expect(recovering.locator('.draw-status')).toHaveText('0 strokes');
    await expect.poll(() => turnDraftStored(recovering)).toBe(false);

    await drawStroke(recovering);
    await recovering.reload();
    await expect(recovering.locator('.draw-status')).toHaveText('1 stroke');
    await recovering.getByRole('button', { name: 'Submit Drawing' }).click();
    await expect(recovering.locator('.submission-state.is-accepted')).toContainText('Watch the TV.');
    await expect.poll(() => turnDraftStored(recovering)).toBe(false);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('manual join canonicalizes the room and survives refresh', async ({ baseURL, browser }) => {
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
      viewport: { width: 390, height: 844 }
    });
    contexts.push(playerContext);
    const player = await playerContext.newPage();
    await player.goto(appUrl('/join'));
    await player.locator('input.code-input').fill(roomCode);
    await player.getByPlaceholder('Your name').fill('Manual Mia');
    await player.getByRole('button', { name: 'Join the Party' }).click();

    await expect(player.locator('.app-shell.player .brand')).toHaveText('Lobby');
    await expect(player).toHaveURL(new RegExp(`/join/${roomCode}$`));

    await player.reload();

    await expect(player.locator('.app-shell.player .brand')).toHaveText('Lobby');
    await expect(player.getByRole('button', { name: 'Edit name' })).toHaveText('Manual Mia');

    const duplicatePromise = playerContext.waitForEvent('page');
    await player.evaluate(() => window.open(window.location.href, '_blank'));
    const duplicate = await duplicatePromise;
    await duplicate.waitForLoadState('domcontentloaded');
    await expect(duplicate.getByRole('button', { name: 'Join the Party' })).toBeVisible();
    await expect(duplicate.getByText('Almost in')).toHaveCount(0);
    await expect(player.locator('.app-shell.player .brand')).toHaveText('Lobby');
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('an interrupted rename is replayed after reconnect and reaches the TV', async ({
  baseURL,
  browser
}) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();
    const [player] = await createPlayers(
      browser,
      contexts,
      appUrl,
      roomCode,
      ['Ava'],
      undefined,
      (context) => installSubmissionHarness(context)
    );

    await configureSubmissionHarness(player, 'setName', 'drop');
    await player.getByRole('button', { name: 'Edit name' }).click();
    await player.getByLabel('Your name').fill('Avery');
    await player.getByRole('button', { name: 'Save name' }).click();

    await expect(player.locator('#connection-text')).not.toHaveText('Connected');
    await expect(player.locator('#connection-text')).toHaveText('Connected', { timeout: 5000 });
    await expect(player.getByRole('button', { name: 'Edit name' })).toHaveText('Avery');
    await expect(tv.locator('.player-name-text')).toHaveText('Avery');
    await expect.poll(() => submissionSendCount(player, 'setName')).toBe(2);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('an offline rename survives full refresh and is replayed after authoritative rejoin', async ({
  baseURL,
  browser
}) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();
    const [player] = await createPlayers(
      browser,
      contexts,
      appUrl,
      roomCode,
      ['Ava'],
      undefined,
      (context) => installSubmissionHarness(context)
    );

    await configureSubmissionHarness(player, 'setName', 'defer');
    await player.getByRole('button', { name: 'Edit name' }).click();
    await player.getByLabel('Your name').fill('Avery');
    await player.getByRole('button', { name: 'Save name' }).click();
    await expect.poll(() => pendingRenameStored(player)).toBe(true);
    await expect.poll(() => submissionSendCount(player, 'setName')).toBe(1);

    await player.reload();

    await expect(player.locator('#connection-text')).toHaveText('Connected', { timeout: 5000 });
    await expect(player.getByRole('button', { name: 'Edit name' })).toHaveText('Avery');
    await expect(tv.locator('.player-name-text')).toHaveText('Avery');
    await expect.poll(() => submissionSendCount(player, 'setName')).toBe(1);
    await expect.poll(() => pendingRenameStored(player)).toBe(false);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('rapid renames serialize before the latest name reconnects after an interrupted ack', async ({
  baseURL,
  browser
}) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();
    const [player] = await createPlayers(
      browser,
      contexts,
      appUrl,
      roomCode,
      ['Ava'],
      undefined,
      (context) => installSubmissionHarness(context)
    );

    await configureSubmissionHarness(player, 'setName', 'defer');
    await player.getByRole('button', { name: 'Edit name' }).click();
    await player.getByLabel('Your name').fill('Bob');
    await player.getByRole('button', { name: 'Save name' }).click();
    await player.getByRole('button', { name: 'Edit name' }).click();
    await player.getByLabel('Your name').fill('Carol');
    await player.getByRole('button', { name: 'Save name' }).click();
    await expect.poll(() => submissionSendCount(player, 'setName')).toBe(1);

    await configureSubmissionHarness(player, 'setName', 'drop');
    await releaseDeferredSubmission(player);

    await expect(player.locator('#connection-text')).not.toHaveText('Connected');
    await expect(player.locator('#connection-text')).toHaveText('Connected', { timeout: 5000 });
    await expect(player.getByRole('button', { name: 'Edit name' })).toHaveText('Carol');
    await expect(tv.locator('.player-name-text')).toHaveText('Carol');
    await expect.poll(() => submissionSendCount(player, 'setName')).toBe(3);
    await expect.poll(() => pendingRenameStored(player)).toBe(false);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('a remembered name does not autojoin an unconfirmed QR room', async ({ baseURL, browser }) => {
  const appUrl = makeAppUrl(baseURL);
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 }
  });

  try {
    await context.addInitScript(() => localStorage.setItem('draw-party-name', 'Remembered Rae'));
    const player = await context.newPage();
    await player.goto(appUrl('/join/ABCD'));

    await expect(player.getByRole('button', { name: 'Join the Party' })).toBeVisible();
    await expect(player.getByPlaceholder('Your name')).toHaveValue('Remembered Rae');
    await expect(player.getByText('Almost in')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('a drawing interrupted by reconnect stays retryable', async ({ baseURL, browser }) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    await expect(tv.locator('.room-code')).toHaveText(/[A-Z]{4}/);
    const roomCode = (await tv.locator('.room-code').innerText()).trim();

    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy'], undefined, (context) =>
      installSubmissionHarness(context)
    );
    await startParty(players[0]);

    await drawStroke(players[0]);
    await configureSubmissionHarness(players[0], 'submitDrawing', 'defer');
    await players[0].getByRole('button', { name: 'Submit Drawing' }).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(players[0].locator('.submission-state.is-pending')).toContainText('Sending');
    await expect.poll(() => submissionSendCount(players[0], 'submitDrawing')).toBe(1);
    await releaseDeferredSubmission(players[0]);
    await expect(players[0].locator('.submission-state.is-accepted')).toContainText('Watch the TV.');

    const interrupted = players[1];
    await drawStroke(interrupted);
    const drawingHostBeforeRetry = await interrupted.locator('.drawing-pad-host').boundingBox();
    if (!drawingHostBeforeRetry) throw new Error('drawing host must have a layout box');
    await configureSubmissionHarness(interrupted, 'submitDrawing', 'drop');
    await interrupted.getByRole('button', { name: 'Submit Drawing' }).click();
    await expect(interrupted.locator('#connection-text')).not.toHaveText('Connected');
    await expect(interrupted.locator('.connection-banner')).toBeVisible();
    await expect(interrupted.locator('#connection-text')).toHaveText('Connected', { timeout: 5000 });
    await expect(interrupted.locator('.connection-banner')).toHaveCount(0);
    await expect(interrupted.locator('.draw-status')).toHaveText('1 stroke');
    const drawingHostDuringRetry = await interrupted.locator('.drawing-pad-host').boundingBox();
    if (!drawingHostDuringRetry) throw new Error('retry must preserve the drawing host');
    expect(Math.abs(drawingHostDuringRetry.height - drawingHostBeforeRetry.height)).toBeLessThan(2);
    await interrupted.getByRole('button', { name: 'Try Submit Again' }).click();
    await expect(interrupted.locator('.submission-state.is-accepted')).toContainText('Watch the TV.');

    await drawStroke(players[2]);
    await players[2].getByRole('button', { name: 'Submit Drawing' }).click();
    await expectTvGuessingStage(tv);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('a fake title is accepted once and survives an interrupted retry with its text intact', async ({
  baseURL,
  browser
}) => {
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
      undefined,
      (context) => installSubmissionHarness(context)
    );
    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    const guessers = await waitForGuessers(players);
    const accepted = guessers[0];
    const acceptedInput = accepted.getByPlaceholder('Something that sounds legit…');
    await acceptedInput.fill('deferred fake title');
    await configureSubmissionHarness(accepted, 'submitGuess', 'defer');
    await accepted.getByRole('button', { name: 'Submit Fake Title' }).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(accepted.locator('.submission-state.is-pending')).toContainText('Sending');
    await expect.poll(() => submissionSendCount(accepted, 'submitGuess')).toBe(1);
    await releaseDeferredSubmission(accepted);
    await expect(accepted.locator('.submission-state.is-accepted')).toContainText('Watch the TV.');

    const interrupted = guessers[1];
    const interruptedInput = interrupted.getByPlaceholder('Something that sounds legit…');
    await interruptedInput.fill('keep this exact fake');
    await configureSubmissionHarness(interrupted, 'submitGuess', 'drop');
    await interrupted.getByRole('button', { name: 'Submit Fake Title' }).click();
    await expect(interrupted.locator('#connection-text')).not.toHaveText('Connected');
    await expect(interrupted.locator('.connection-banner')).toBeVisible();
    await expect(interrupted.getByRole('button', { name: 'Try Again' })).toBeVisible();
    await expect(interrupted.locator('#connection-text')).toHaveText('Connected', { timeout: 5000 });
    await expect(interrupted.locator('.connection-banner')).toHaveCount(0);
    await expect(interruptedInput).toHaveValue('keep this exact fake');
    await interrupted.getByRole('button', { name: 'Try Again' }).click();
    await expect(interrupted.locator('.submission-state.is-accepted')).toContainText('Watch the TV.');

    await guessers[2].getByPlaceholder('Something that sounds legit…').fill('last fake');
    await guessers[2].getByRole('button', { name: 'Submit Fake Title' }).click();
    await expectTvVotingStage(tv);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('an unfinished fake title survives full refresh without becoming a pending submission', async ({
  baseURL,
  browser
}) => {
  const contexts: BrowserContext[] = [];
  const appUrl = makeAppUrl(baseURL);

  try {
    const tvContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    contexts.push(tvContext);
    const tv = await tvContext.newPage();
    await tv.goto(appUrl('/'));
    const roomCode = (await tv.locator('.room-code').innerText()).trim();
    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy']);
    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    const guessers = await waitForGuessers(players);
    const recovering = guessers[0];
    const input = recovering.getByPlaceholder('Something that sounds legit…');
    await input.fill('the exact reload fake');
    await expect.poll(() => turnDraftStored(recovering)).toBe(true);

    await recovering.reload();

    const restoredInput = recovering.getByPlaceholder('Something that sounds legit…');
    await expect(restoredInput).toHaveValue('the exact reload fake');
    await expect(recovering.locator('.submission-state.is-pending')).toHaveCount(0);
    await expect(recovering.getByRole('button', { name: 'Submit Fake Title' })).toBeEnabled();
    await recovering.getByRole('button', { name: 'Submit Fake Title' }).click();
    await expect(recovering.locator('.submission-state.is-accepted')).toContainText('Watch the TV.');
    await expect.poll(() => turnDraftStored(recovering)).toBe(false);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

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

    const players = await createPlayers(browser, contexts, appUrl, roomCode, ['Ava', 'Bo', 'Cy']);
    await hostSaveRounds(players[0], '2');
    await startParty(players[0]);
    await expectTvDrawingStage(tv);

    for (const player of players) {
      await expect(player.locator('#prompt-text')).not.toContainText(/^Draw:/);
      await expect(player.locator('#prompt-text')).not.toHaveText('Waiting for prompt...');
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

    await expect(late.getByText('Look up')).toBeVisible({ timeout: 5000 });
    await expect(late.locator('.prompt.small')).toHaveAttribute(
      'aria-label',
      'Spectating. Look up. You play next round.'
    );
    await expect(late.locator('.spectator-banner')).toHaveCount(0);
    await expect(late.locator('.spectator-pill')).toHaveCount(0);
    expect((await late.locator('.spectator-turn').innerText()).toLowerCase()).not.toContain(
      'you play next round'
    );
    await expect(late.locator('.action-hint')).toHaveCount(0);
    await expect(late.locator('canvas.draw-canvas')).toHaveCount(0);
    await expect(late.locator('.phone-canvas')).toHaveCount(0);
    await expect(tv.locator('.spectator-watchers')).toContainText('Late');
    await expect(tv.locator('.spectator-watchers')).toHaveAttribute('aria-label', /spectating/i);
    expect((await tv.locator('.spectator-watchers').innerText()).toLowerCase()).not.toContain('spectating');
    await expect(tv.locator('.spectator-watchers .spectator-pill')).toHaveCount(0);

    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    // Burn through the first round of reveals so the room advances to round 2 drawing.
    for (let turn = 0; turn < players.length; turn += 1) {
      await expectTvGuessingStage(tv);
      await expect(late.locator('.phone-canvas')).toHaveCount(0);
      await expect(late.getByText('Look up')).toBeVisible();
      const guessers = await waitForGuessers(players);
      for (const [index, guesser] of guessers.entries()) {
        await guesser.getByPlaceholder('Something that sounds legit…').fill(`late fake ${turn} ${index}`);
        await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
      }
      await expectTvVotingStage(tv);
      await expect(late.locator('.action-hint')).toHaveCount(0);
      await expect(late.locator('.player-vote-list')).toHaveCount(0);
      await expect(late.locator('.phone-canvas')).toHaveCount(0);
      await expect(late.getByText('Look up')).toBeVisible();
      for (const voter of guessers) {
        await voter.locator('button.vote-option:not([disabled])').first().click();
      }
      await expect(tv.locator('.reveal-prompt')).toBeVisible();
      const tvContinue = tv.getByRole('button', {
        name: 'Continue from TV (fallback)',
        exact: true
      });
      await expect(tvContinue).toBeEnabled({ timeout: 9000 });
      await tvContinue.click();
    }

    await expectTvDrawingStage(tv);
    await expect(tv.getByText(/Round 2 of \d+/)).toBeVisible();
    await expect(late.locator('#prompt-text')).not.toHaveText('Waiting for prompt...', { timeout: 5000 });
    await expect(late.locator('#prompt-text')).not.toContainText(/^Draw:/);
    await expect(late.locator('canvas.draw-canvas')).toBeVisible();
    await expect(late.getByRole('button', { name: 'Submit Drawing' })).toHaveCount(0);
    await drawStroke(late);
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
    await startParty(players[0]);
    await expectTvDrawingStage(tv);

    const dropout = players[2];
    await dropout.context().close();
    const remaining = players.slice(0, 2);

    for (const player of remaining) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('a vote is accepted once and an interrupted choice remains retryable', async ({ baseURL, browser }) => {
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
      ['Ava', 'Bo', 'Cy', 'Dee'],
      undefined,
      (context) => installSubmissionHarness(context)
    );

    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
    const guessers = await waitForGuessers(players);
    for (const [index, guesser] of guessers.entries()) {
      await guesser.getByPlaceholder('Something that sounds legit…').fill(`reconnect fake ${index}`);
      await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
    }
    await expectTvVotingStage(tv);

    const acceptedVoter = guessers[0];
    const acceptedOption = acceptedVoter.locator('button.vote-option:not([disabled])').first();
    await configureSubmissionHarness(acceptedVoter, 'submitVote', 'defer');
    await acceptedOption.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(acceptedVoter.locator('.submission-state.is-pending')).toContainText('Sending');
    await expect.poll(() => submissionSendCount(acceptedVoter, 'submitVote')).toBe(1);
    await releaseDeferredSubmission(acceptedVoter);
    await expect(acceptedVoter.locator('.submission-state.is-accepted')).toContainText('Watch the TV.');
    await expect(acceptedVoter.locator('.player-vote-list')).toHaveCount(0);

    const interruptedVoter = guessers[1];
    const interruptedOption = interruptedVoter.locator('button.vote-option:not([disabled])').first();
    const chosenText = (
      await interruptedOption.locator('.vote-answer').evaluate((element) => element.textContent?.trim() ?? '')
    ).trim();
    await configureSubmissionHarness(interruptedVoter, 'submitVote', 'drop');
    await interruptedOption.click();
    await expect(interruptedVoter.locator('#connection-text')).not.toHaveText('Connected');
    await expect(interruptedVoter.locator('.connection-banner')).toBeVisible();
    await expect(interruptedVoter.locator('.player-vote-list')).toBeVisible();
    await expect(interruptedVoter.locator('#connection-text')).toHaveText('Connected', { timeout: 5000 });
    await expect(interruptedVoter.locator('.connection-banner')).toHaveCount(0);
    const retryOption = interruptedVoter.locator('button.vote-option', { hasText: chosenText });
    await expect(retryOption).toContainText('Tap again to retry');
    await retryOption.click();
    await expect(interruptedVoter.locator('.submission-state.is-accepted')).toContainText('Watch the TV.');

    await guessers[2].locator('button.vote-option:not([disabled])').first().click();
    await expect(tv.locator('.reveal-prompt')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

const sePhone = { width: 375, height: 667, isMobile: true };

test('drawing reconnect overlay keeps the pad on iPhone SE', async ({ baseURL, browser }) => {
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
      [sePhone, sePhone, sePhone],
      (context) => installSubmissionHarness(context)
    );
    await startParty(players[0]);

    await drawStroke(players[0]);
    await players[0].getByRole('button', { name: 'Submit Drawing' }).click();

    const interrupted = players[1];
    await drawStroke(interrupted);
    const padBefore = await interrupted.locator('.drawing-pad-host').boundingBox();
    if (!padBefore) {
      throw new Error('Drawing pad must have a layout box.');
    }

    await configureSubmissionHarness(interrupted, 'submitDrawing', 'drop');
    await interrupted.getByRole('button', { name: 'Submit Drawing' }).click();
    await expect(interrupted.locator('.connection-banner')).toBeVisible();
    await expectWithinViewportHeight(interrupted, 'canvas.draw-canvas', sePhone.height);
    await expectWithinViewportHeight(interrupted, 'button:has-text("Try Submit Again")', sePhone.height);
    const padDuring = await interrupted.locator('.drawing-pad-host').boundingBox();
    if (!padDuring) {
      throw new Error('Drawing pad must stay laid out during reconnect.');
    }
    expect(Math.abs(padDuring.height - padBefore.height)).toBeLessThan(2);

    await expect(interrupted.locator('#connection-text')).toHaveText('Connected', { timeout: 5000 });
    await interrupted.getByRole('button', { name: 'Try Submit Again' }).click();
    await expect(interrupted.locator('.submission-state.is-accepted')).toContainText('Watch the TV.');

    await drawStroke(players[2]);
    await players[2].getByRole('button', { name: 'Submit Drawing' }).click();
    await expectTvGuessingStage(tv);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('guess reconnect overlay keeps fake title controls on iPhone SE', async ({ baseURL, browser }) => {
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
      [sePhone, sePhone, sePhone],
      (context) => installSubmissionHarness(context)
    );
    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
    const guessers = await waitForGuessers(players);
    const interrupted = guessers[0];
    const titleInput = interrupted.getByPlaceholder('Something that sounds legit…');
    await titleInput.fill('overlay couch fake');
    const inputBefore = await titleInput.boundingBox();
    if (!inputBefore) {
      throw new Error('Fake title field must have a layout box.');
    }

    await configureSubmissionHarness(interrupted, 'submitGuess', 'drop');
    await interrupted.getByRole('button', { name: 'Submit Fake Title' }).click();
    await expect(interrupted.locator('.connection-banner')).toBeVisible();
    await expectWithinViewportHeight(interrupted, 'input[placeholder="Something that sounds legit…"]', sePhone.height);
    await expectWithinViewportHeight(interrupted, 'button:has-text("Try Again")', sePhone.height);
    const inputDuring = await titleInput.boundingBox();
    if (!inputDuring) {
      throw new Error('Fake title field must stay laid out during reconnect.');
    }
    expect(Math.abs(inputDuring.y - inputBefore.y)).toBeLessThan(2);

    await expect(interrupted.locator('#connection-text')).toHaveText('Connected', { timeout: 5000 });
    await interrupted.getByRole('button', { name: 'Try Again' }).click();
    await expect(interrupted.locator('.submission-state.is-accepted')).toContainText('Watch the TV.');

    for (const [index, guesser] of guessers.slice(1).entries()) {
      await guesser.getByPlaceholder('Something that sounds legit…').fill(`se fake ${index}`);
      await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
    }
    await expectTvVotingStage(tv);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('vote reconnect overlay keeps the letter grid on iPhone SE', async ({ baseURL, browser }) => {
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
      [sePhone, sePhone, sePhone],
      (context) => installSubmissionHarness(context)
    );
    await startParty(players[0]);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
    const guessers = await waitForGuessers(players);
    for (const [index, guesser] of guessers.entries()) {
      await guesser.getByPlaceholder('Something that sounds legit…').fill(`vote overlay ${index}`);
      await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
    }
    await expectTvVotingStage(tv);

    const interruptedVoter = guessers[0];
    const voteListBefore = await interruptedVoter.locator('.player-vote-list').boundingBox();
    if (!voteListBefore) {
      throw new Error('Vote grid must have a layout box.');
    }
    const voteOption = interruptedVoter.locator('button.vote-option:not([disabled])').first();
    const chosenText = (
      await voteOption.locator('.vote-answer').evaluate((element) => element.textContent?.trim() ?? '')
    ).trim();

    await configureSubmissionHarness(interruptedVoter, 'submitVote', 'drop');
    await voteOption.click();
    await expect(interruptedVoter.locator('.connection-banner')).toBeVisible();
    await expectWithinViewportHeight(interruptedVoter, '.player-vote-list', sePhone.height);
    await expectWithinViewportHeight(
      interruptedVoter,
      '.player-vote-list button.vote-option',
      sePhone.height
    );
    const voteListDuring = await interruptedVoter.locator('.player-vote-list').boundingBox();
    if (!voteListDuring) {
      throw new Error('Vote grid must stay laid out during reconnect.');
    }
    expect(Math.abs(voteListDuring.height - voteListBefore.height)).toBeLessThan(2);

    await expect(interruptedVoter.locator('#connection-text')).toHaveText('Connected', { timeout: 5000 });
    await interruptedVoter.locator('button.vote-option', { hasText: chosenText }).click();
    await expect(interruptedVoter.locator('.submission-state.is-accepted')).toContainText('Watch the TV.');

    await guessers[1].locator('button.vote-option:not([disabled])').first().click();
    await expect(tv.locator('.reveal-prompt')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});

test('results reconnect overlay keeps host Continue on iPhone SE', async ({ baseURL, browser }) => {
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
      [sePhone, sePhone, sePhone],
      (context) => installSubmissionHarness(context)
    );
    const host = players[0];
    await host.getByRole('button', { name: 'Relaxed: More time to draw' }).click();
    await startParty(host);
    for (const player of players) {
      await drawStroke(player);
      await player.getByRole('button', { name: 'Submit Drawing' }).click();
    }

    await expectTvGuessingStage(tv);
    const guessers = await waitForGuessers(players);
    for (const [index, guesser] of guessers.entries()) {
      await guesser.getByPlaceholder('Something that sounds legit…').fill(`results overlay ${index}`);
      await guesser.getByRole('button', { name: 'Submit Fake Title' }).click();
    }

    await expectTvVotingStage(tv);
    const voters = await waitForPagesWithVisibleLocatorCount(
      players,
      'button.vote-option:not([disabled])',
      Math.max(0, players.length - 1)
    );
    for (const voter of voters) {
      await voter.locator('button.vote-option:not([disabled])').first().click();
    }

    await expect(tv.locator('.results-panel.display-results')).toHaveAttribute('data-reveal-stage', 'complete', {
      timeout: 12_000
    });
    const hostContinue = host.getByRole('button', { name: 'Continue' });
    await expect(hostContinue).toBeEnabled({ timeout: 12_000 });
    const continueBefore = await host.locator('.result-phone-advance').boundingBox();
    if (!continueBefore) {
      throw new Error('Host Continue panel must have a layout box.');
    }

    await configureSubmissionHarness(host, 'startGame', 'drop');
    await hostContinue.click();
    await expect(host.locator('.connection-banner')).toBeVisible();
    await expectWithinViewportHeight(host, '.result-phone-advance', sePhone.height);
    await expectWithinViewportHeight(host, 'button:has-text("Continue")', sePhone.height);
    const continueDuring = await host.locator('.result-phone-advance').boundingBox();
    if (!continueDuring) {
      throw new Error('Host Continue panel must stay laid out during reconnect.');
    }
    expect(Math.abs(continueDuring.y - continueBefore.y)).toBeLessThan(2);

    await expect(host.locator('#connection-text')).toHaveText('Connected', { timeout: 5000 });
    await expect(host.getByRole('button', { name: 'Continuing…' })).toHaveCount(0);
    const continueButton = host.getByRole('button', { name: 'Continue' });
    if (await continueButton.isVisible()) {
      await expect(continueButton).toBeEnabled();
      await continueButton.click();
    }
    await expectTvGuessingStage(tv);
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  }
});
